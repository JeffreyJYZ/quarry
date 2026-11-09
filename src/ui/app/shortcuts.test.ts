import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { SHORTCUT_GROUPS } from "@/lib/consts/app";

const REPO_ROOT = join(import.meta.dir, "../../..");
const RUST_MENU = "src-tauri/src/menu/mod.rs";

/**
 * Chords a predefined macOS menu item owns.
 *
 * They live in the pinned `muda` crate rather than in `mod.rs`, and this table is the only place
 * that fact exists outside it: `PredefinedMenuItemType::CloseWindow` is given `Cmd+W` on macOS, so
 * the in-app close-tab binding never sees that chord.
 */
const PREDEFINED_CHORDS: ReadonlyMap<string, string> = new Map([["close_window", "Cmd+W"]]);

/** Read the menu source, failing with its name rather than an opaque filesystem error. */
function readMenuSource(): string {
	try {
		return readFileSync(join(REPO_ROOT, RUST_MENU), "utf8");
	} catch (error) {
		throw new Error(`shortcut test cannot read ${RUST_MENU}: ${String(error)}`);
	}
}

/** Every non-empty `.accelerator("…")` on a `with_id` item, in the order the file declares them. */
function declaredAccelerators(source: string): string[] {
	const accelerators: string[] = [];
	for (const item of source.matchAll(/with_id\("[^"]+"([\s\S]*?)\.build\(app\)\?/g)) {
		const accelerator = item[1].match(/\.accelerator\("([^"]+)"\)/);
		if (accelerator !== null && accelerator[1] !== "") accelerators.push(accelerator[1]);
	}
	return accelerators;
}

/** The chords the predefined items this file uses are given by the platform. */
function predefinedAccelerators(source: string): string[] {
	return [...PREDEFINED_CHORDS].flatMap(([name, chord]) =>
		source.includes(`PredefinedMenuItem::${name}(`) ? [chord] : [],
	);
}

/** `CmdOrCtrl+Alt+F` and the sheet's `Cmd` + `Alt` + `F` are the same chord. */
function normalize(accelerator: string): string {
	return accelerator
		.replace(/CmdOrCtrl|CommandOrControl/g, "Cmd")
		.split("+")
		.map((part) => part.trim())
		.join("+");
}

const entries = SHORTCUT_GROUPS.flatMap((group) => group.entries);
const menuChords = new Set(
	[...declaredAccelerators(readMenuSource()), ...predefinedAccelerators(readMenuSource())].map(
		normalize,
	),
);

describe("shortcut sheet against the native menu", () => {
	test("the extraction itself reads the menu source", () => {
		// Guard the parser: an empty set would let the ownership check pass for free.
		const declared = declaredAccelerators(readMenuSource());
		expect(declared).toContain("CmdOrCtrl+O");
		expect(declared).toContain("CmdOrCtrl+Alt+F");
		expect(predefinedAccelerators(readMenuSource())).toEqual(["Cmd+W"]);
		expect(entries.length).toBeGreaterThan(0);
	});

	test("no entry advertises a menu-owned chord without saying so", () => {
		const silent = entries.filter(
			(entry) => menuChords.has(entry.keys.join("+")) && entry.menu !== true,
		);
		expect(silent.map((entry) => `${entry.keys.join("+")}: ${entry.action}`)).toEqual([]);
	});

	test("every menu marker names a chord the menu really owns", () => {
		// The other direction: a marker left behind after an accelerator was removed is a lie too.
		const stale = entries.filter(
			(entry) => entry.menu === true && !menuChords.has(entry.keys.join("+")),
		);
		expect(stale.map((entry) => `${entry.keys.join("+")}: ${entry.action}`)).toEqual([]);
	});

	test("a chord that shadows an in-app command says what happens to it", () => {
		const shadowed = ["Cmd+O", "Cmd+N", "Cmd+Alt+F", "Cmd+W"];
		for (const chord of shadowed) {
			const entry = entries.find((candidate) => candidate.keys.join("+") === chord);
			expect(entry).toBeDefined();
			expect(entry?.menu).toBe(true);
			expect(entry?.note).toContain("never runs");
		}
	});
});
