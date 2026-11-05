import { describe, expect, test } from "bun:test";
import { notesTagFor, parseNotes, shouldShowWhatsNew } from "@/lib/updates/notes";

describe("notesTagFor", () => {
	test("an alpha maps to the tag release-local publishes", () => {
		expect(notesTagFor("0.1.0-alpha.76")).toBe("quarry-alpha76");
	});

	test("a stable version maps to v<version>", () => {
		expect(notesTagFor("1.2.3")).toBe("v1.2.3");
	});
});

describe("parseNotes", () => {
	test("headings, bullets and bold lose their markers", () => {
		const body = ["## Changes", "", "- **feat**: restart lsp", "- fix: tree indent"].join("\n");
		expect(parseNotes(body)).toEqual(["Changes", "feat: restart lsp", "fix: tree indent"]);
	});

	test("fences are dropped whole", () => {
		const body = ["- one", "```", "code here", "```", "- two"].join("\n");
		expect(parseNotes(body)).toEqual(["one", "two"]);
	});

	test("numbered entries keep their text", () => {
		expect(parseNotes("1. first\n2. second")).toEqual(["first", "second"]);
	});

	test("an empty body yields no lines", () => {
		expect(parseNotes("\n\n  \n")).toEqual([]);
	});
});

describe("shouldShowWhatsNew", () => {
	test("a first install stays quiet", () => {
		expect(shouldShowWhatsNew("0.1.0-alpha.76", null)).toBe(false);
	});

	test("the launch after an update shows the notes", () => {
		expect(shouldShowWhatsNew("0.1.0-alpha.76", "0.1.0-alpha.75")).toBe(true);
	});

	test("the same version does not show again", () => {
		expect(shouldShowWhatsNew("0.1.0-alpha.76", "0.1.0-alpha.76")).toBe(false);
	});
});
