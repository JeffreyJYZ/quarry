import { describe, expect, test } from "bun:test";
import {
	composeNotes,
	firstProseParagraph,
	groupFor,
	isVersionBump,
	type NotesSources,
	summaryIndex,
	updateLine,
} from "./notes";

const BODY =
	"Now an Initialize panel offers four kinds.\n\n" +
	"The panel reuses the existing pickers, so there is no second list to drift.\n\nGate green.";

function sources(
	subjects: string[],
	pullRequest: NotesSources["pullRequest"] = () => null,
): NotesSources {
	return {
		previousTag: () => "quarry-alpha104",
		subjects: () => subjects,
		pullRequest,
	};
}

describe("grouping", () => {
	test("a chore lands Under the hood and a version bump nowhere", () => {
		const notes = composeNotes(
			"HEAD",
			"0.1.0-alpha.105",
			sources(
				[
					"feat(ui): initialize panel (#231)",
					"chore: tidy the lockfile (#229)",
					"chore: bump to 0.1.0-alpha.105 (#232)",
				],
				() => ({ title: "chore: tidy the lockfile", body: BODY }),
			),
		);
		expect(notes).toContain("## Under the hood");
		expect(notes).toContain("- tidy the lockfile (#229)");
		expect(notes).not.toContain("bump to 0.1.0-alpha.105");
		expect(isVersionBump("chore(release): bump to 1.2.3 (#3)")).toBe(true);
		expect(groupFor("docs: explain settings")).toBe("under");
		expect(groupFor("fix(term): flat pane (#7)")).toBe("fixes");
	});

	test("an empty range says so", () => {
		expect(composeNotes("HEAD", "1.0.0", sources(["chore: bump to 1.0.0 (#1)"]))).toBe(
			"No user-visible changes since quarry-alpha104.",
		);
	});
});

describe("pull request bodies", () => {
	test("a PR body paragraph is indented under the PR title", () => {
		const notes = composeNotes(
			"HEAD",
			"1.0.0",
			sources(["fix(term): ring around pane (#7)"], () => ({
				title: "fix(term): one flat surface",
				body: BODY,
			})),
		);
		expect(notes).toContain("- one flat surface (#7)");
		expect(notes).not.toContain("fix(term):");
		expect(notes).toContain("  Now an Initialize panel offers four kinds.");
		expect(notes).toContain("## Fixes");
	});

	test("the index names the displayed title, not the body prose", () => {
		const notes = composeNotes(
			"HEAD",
			"1.0.0",
			sources(["feat(ui): initialize panel (#231)"], () => ({
				title: "feat(ui): initialize panel",
				body: BODY,
			})),
		);
		expect(notes.split("\n")[0]).toBe("One change: initialize panel.");
		expect(notes).not.toContain("Changes since");
		expect(firstProseParagraph("## Summary\n- a list\n\nNow the panel opens.\n")).toBe(
			"Now the panel opens.",
		);
	});
});

describe("degradation", () => {
	test("gh failure falls back to the subject list and says why", () => {
		const thrown = sources(
			["feat(ui): initialize panel (#231)", "chore: bump to 1.0.0 (#232)"],
			() => {
				throw new Error("gh: could not resolve host");
			},
		);
		const notes = composeNotes("HEAD", "1.0.0", thrown);
		expect(notes.split("\n")[0]).toBe(
			"Summary unavailable: could not read the merged pull requests.",
		);
		expect(notes).toContain("- feat(ui): initialize panel (#231)");
		expect(notes).not.toContain("## Features");
		expect(notes).not.toContain("bump to 1.0.0");
	});

	test("a missing PR is a bare subject beside the enriched ones", () => {
		const notes = composeNotes(
			"HEAD",
			"1.0.0",
			sources(["feat(a): one (#1)", "feat(b): two (#2)"], (number) =>
				number === 1 ? { title: "feat(a): one", body: BODY } : null,
			),
		);
		expect(notes).toContain("- feat(b): two (#2)");
		expect(notes).not.toContain("Summary unavailable");
	});
});

describe("the summary index", () => {
	test("One, Two and N changes all come from the displayed titles", () => {
		expect(summaryIndex(["a"])).toBe("One change: a.");
		expect(summaryIndex(["a", "b"])).toBe("Two changes: a; b.");
		expect(summaryIndex(["a", "b", "c", "d"])).toBe("4 changes: a; b; c; d.");
		const notes = composeNotes(
			"HEAD",
			"1.0.0",
			sources(
				[1, 2, 3, 4].map((number) => `feat(ui): change ${number} (#${number})`),
				(number) => ({
					title: `feat(ui): change ${number}`,
					body: `Body prose for ${number}.\n\nSecond paragraph for ${number}.`,
				}),
			),
		);
		expect(notes.split("\n")[0]).toBe("4 changes: change 1; change 2; change 3; change 4.");
	});

	test("no summary sentence appears inside an entry paragraph", () => {
		const notes = composeNotes(
			"HEAD",
			"1.0.0",
			sources(["feat(a): alpha title (#1)", "feat(b): beta title (#2)"], (number) => ({
				title: `feat(x): body ${number}`,
				body: `Body prose for ${number}.`,
			})),
		);
		const summary = notes.split("\n")[0] ?? "";
		const paragraphs = notes
			.split("\n")
			.filter((line) => line.startsWith("  "))
			.map((line) => line.trim());
		expect(paragraphs.length).toBe(2);
		for (const sentence of summary.split(/(?<=[.!?])\s+/)) {
			for (const paragraph of paragraphs) expect(paragraph.includes(sentence)).toBe(false);
		}
		expect(paragraphs).not.toContain(summary);
	});
});

describe("the update line", () => {
	test("names the version it was given, not a constant", () => {
		expect(updateLine("9.8.7-alpha.42")).toContain("quarry_9.8.7-alpha.42_universal.dmg");
		expect(
			composeNotes("HEAD", "9.8.7-alpha.42", sources(["feat(ui): panel (#231)"])),
		).toContain("quarry_9.8.7-alpha.42_universal.dmg");
	});
});
