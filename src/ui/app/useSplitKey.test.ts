import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { SHORTCUT_GROUPS } from "@/lib/consts/app";
import { isSplitChord } from "@/ui/app/useSplitKey";

const REPO_ROOT = join(import.meta.dir, "../../..");
const RUST_MENU = "src-tauri/src/menu/mod.rs";

const CHORD = { key: "`", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };

function readMenuSource(): string {
	try {
		return readFileSync(join(REPO_ROOT, RUST_MENU), "utf8");
	} catch (error) {
		throw new Error(`split chord test cannot read ${RUST_MENU}: ${String(error)}`);
	}
}

describe("the split editor chord", () => {
	test("Cmd+` toggles the split and nothing else does", () => {
		expect(isSplitChord(CHORD)).toBe(true);
		expect(isSplitChord({ ...CHORD, metaKey: false })).toBe(false);
		expect(isSplitChord({ ...CHORD, ctrlKey: true })).toBe(false);
		expect(isSplitChord({ ...CHORD, altKey: true })).toBe(false);
		expect(isSplitChord({ ...CHORD, shiftKey: true })).toBe(false);
		expect(isSplitChord({ ...CHORD, key: "\\" })).toBe(false);
	});

	test("the shortcut sheet documents exactly the chord the binding answers to", () => {
		const entry = SHORTCUT_GROUPS.flatMap((group) => group.entries).find(
			(candidate) => candidate.action === "Split editor right",
		);
		expect(entry).toBeDefined();
		expect(entry?.keys).toEqual(["Cmd", "`"]);
		expect(entry?.menu).toBeUndefined();
	});

	test("no native menu accelerator claims it, so the in-app binding is the one that runs", () => {
		const declared = [...readMenuSource().matchAll(/\.accelerator\("([^"]+)"\)/g)].map(
			(match) => match[1],
		);
		expect(declared.length).toBeGreaterThan(0);
		expect(declared.filter((accelerator) => accelerator.includes("`"))).toEqual([]);
	});
});
