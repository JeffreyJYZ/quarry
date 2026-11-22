import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ALPHA107_BLOCKS } from "@/lib/updates/fixtures";
import { NOTES_EMPTY, NOTES_FAILED, NOTES_LOADING } from "@/lib/updates/messages";
import type { NoteBlock } from "@/lib/updates/notes";

const state: { notes: NoteBlock[] | null; failed: boolean } = {
	notes: ALPHA107_BLOCKS,
	failed: false,
};

mock.module("@/ui/updates/useReleaseNotes", () => ({ useReleaseNotes: () => state }));

import ReleaseNotes from "@/ui/updates/ReleaseNotes";

afterEach(() => {
	state.notes = ALPHA107_BLOCKS;
	state.failed = false;
	cleanup();
});

describe("the what's new panel", () => {
	test("headings and the lead are not bullets; entries are", () => {
		const view = render(<ReleaseNotes version="0.1.0-alpha.107" />);
		const items = [...view.container.querySelectorAll("li")];
		expect(items).toHaveLength(3);
		for (const item of items) expect(item.textContent).toMatch(/\(#\d+\)|#\d+/);

		for (const text of ["3 changes:", "Fixes", "Features", "How to update"]) {
			const node = [...view.container.querySelectorAll("p")].find((el) =>
				el.textContent?.startsWith(text),
			);
			expect(node).toBeDefined();
			expect(node?.closest("li")).toBeNull();
		}
	});

	test("inline markdown never reaches the DOM", () => {
		const view = render(<ReleaseNotes version="0.1.0-alpha.107" />);
		const text = view.container.textContent ?? "";
		expect(text).not.toContain("`");
		expect(text).not.toContain("*");
		expect(text).toContain("latest.json carried them too");
	});

	test("an entry carries its paragraph as a muted sibling", () => {
		const view = render(<ReleaseNotes version="0.1.0-alpha.107" />);
		const entry = [...view.container.querySelectorAll("li")].find((el) =>
			el.textContent?.includes("the initialize panel invites"),
		);
		expect(entry).toBeDefined();
		const title = entry?.querySelector(".notes-entry-title");
		const paragraph = entry?.querySelector(".notes-entry-body");
		expect(title?.textContent).toBe("the initialize panel invites instead of diagnosing");
		expect(title?.parentElement).toBe(entry);
		expect(paragraph?.parentElement).toBe(entry);
		expect(paragraph?.textContent).toContain("This folder is not a project");
	});

	test("a failed lookup, an empty body and a pending one say different things", () => {
		state.notes = null;
		state.failed = true;
		const failed = render(<ReleaseNotes version="0.1.0-alpha.107" />);
		expect(failed.container.textContent).toContain(NOTES_FAILED);
		cleanup();

		state.notes = [];
		state.failed = false;
		const empty = render(<ReleaseNotes version="0.1.0-alpha.107" />);
		expect(empty.container.textContent).toContain(NOTES_EMPTY);
		cleanup();

		state.notes = null;
		const pending = render(<ReleaseNotes version="0.1.0-alpha.107" />);
		expect(pending.container.textContent).toContain(NOTES_LOADING);
	});
});
