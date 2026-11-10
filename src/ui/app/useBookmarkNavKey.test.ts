import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { SHORTCUT_GROUPS } from "@/lib/consts/app";
import { bookmarkStep } from "@/ui/app/useBookmarkNavKey";

const REPO_ROOT = join(import.meta.dir, "../../..");
const RUST_MENU = "src-tauri/src/menu/mod.rs";
const EDITOR_DIR = "src/ui/editor";
const SHELL_KEYMAPS = "src/ui/app/useShellKeymaps.ts";

const NEXT = { key: "n", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
const ALT_NEXT = { ...NEXT, altKey: true };

function readSource(relativePath: string): string {
	try {
		return readFileSync(join(REPO_ROOT, relativePath), "utf8");
	} catch (error) {
		throw new Error(`bookmark chord test cannot read ${relativePath}: ${String(error)}`);
	}
}

/** Every editor keymap module, tests excluded, joined so one regex sees them all. */
function keymapSource(): string {
	const names = readdirSync(join(REPO_ROOT, EDITOR_DIR)).filter(
		(name) => name.startsWith("keymap") && name.endsWith(".ts") && !name.endsWith(".test.ts"),
	);
	expect(names.length).toBeGreaterThan(0);
	return names.map((name) => readSource(`${EDITOR_DIR}/${name}`)).join("\n");
}

/** The menu's accelerators, in the spelling the sheet uses (`CmdOrCtrl` is `Cmd`). */
function menuChords(): string[] {
	return [...readSource(RUST_MENU).matchAll(/\.accelerator\("([^"]+)"\)/g)].map((match) =>
		(match[1] ?? "").replace(/CmdOrCtrl|CommandOrControl/g, "Cmd"),
	);
}

describe("the bookmark step chords", () => {
	test("Cmd+Alt+N is next and Cmd+Alt+P is previous, and nothing else is either", () => {
		expect(bookmarkStep(ALT_NEXT)).toBe(1);
		expect(bookmarkStep({ ...ALT_NEXT, key: "P" })).toBe(-1);
		expect(bookmarkStep(NEXT)).toBeNull();
		expect(bookmarkStep({ ...ALT_NEXT, ctrlKey: true })).toBeNull();
		expect(bookmarkStep({ ...ALT_NEXT, shiftKey: true })).toBeNull();
		expect(bookmarkStep({ ...ALT_NEXT, metaKey: false })).toBeNull();
		expect(bookmarkStep({ ...ALT_NEXT, key: "k" })).toBeNull();
	});

	test("no native menu accelerator owns either chord", () => {
		const chords = menuChords();
		expect(chords.length).toBeGreaterThan(0);
		expect(chords.filter((chord) => chord === "Cmd+Alt+N" || chord === "Cmd+Alt+P")).toEqual(
			[],
		);
	});

	test("no editor keymap claims either chord", () => {
		const source = keymapSource();
		expect(source).toContain("Mod-Alt-k");
		expect([...source.matchAll(/Mod-Alt-[A-Za-z0-9]/g)].map((match) => match[0])).not.toContain(
			"Mod-Alt-n",
		);
		expect([...source.matchAll(/Mod-Alt-[A-Za-z0-9]/g)].map((match) => match[0])).not.toContain(
			"Mod-Alt-p",
		);
	});

	test("the shortcut sheet documents exactly the chords the binding answers to", () => {
		const entries = SHORTCUT_GROUPS.flatMap((group) => group.entries);
		const next = entries.find((entry) => entry.action === "Next bookmark");
		const previous = entries.find((entry) => entry.action === "Previous bookmark");
		expect(next?.keys).toEqual(["Cmd", "Alt", "N"]);
		expect(previous?.keys).toEqual(["Cmd", "Alt", "P"]);
		expect(next?.menu).toBeUndefined();
		expect(previous?.menu).toBeUndefined();
	});

	test("the shell installs the binding, so the chords are not dead", () => {
		expect(readSource(SHELL_KEYMAPS)).toContain("useBookmarkNavKey(");
	});
});
