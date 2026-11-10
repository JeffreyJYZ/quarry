import { describe, expect, test } from "bun:test";
import { isStructureChord } from "@/ui/structure/chord";

function chord(
	key: string,
	mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
) {
	return {
		key,
		metaKey: mods.meta ?? false,
		ctrlKey: mods.ctrl ?? false,
		altKey: mods.alt ?? false,
		shiftKey: mods.shift ?? false,
	};
}

describe("the File Structure chord", () => {
	test("Cmd+F12 opens it", () => {
		expect(isStructureChord(chord("F12", { meta: true }))).toBe(true);
	});

	test("F12 alone stays go to definition", () => {
		expect(isStructureChord(chord("F12"))).toBe(false);
	});

	test("the shifted, alternative and control chords on F12 belong to other actions", () => {
		expect(isStructureChord(chord("F12", { meta: true, shift: true }))).toBe(false);
		expect(isStructureChord(chord("F12", { meta: true, alt: true }))).toBe(false);
		expect(isStructureChord(chord("F12", { meta: true, ctrl: true }))).toBe(false);
	});

	test("no other key opens it", () => {
		expect(isStructureChord(chord("F11", { meta: true }))).toBe(false);
		expect(isStructureChord(chord("s", { meta: true }))).toBe(false);
	});
});
