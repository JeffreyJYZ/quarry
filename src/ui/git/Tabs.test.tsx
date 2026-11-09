import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GitPanelTab } from "@/lib/git/useHistory";
import Tabs from "@/ui/git/Tabs";

function markup(tab: GitPanelTab, activePath: string | null): string {
	return renderToStaticMarkup(
		<Tabs
			tab={tab}
			activePath={activePath}
			onChanges={() => {}}
			onHistory={() => {}}
			onBlame={() => {}}
		/>,
	);
}

/** Each tab's opening tag beside its label, so selection is asserted on the right one. */
function tabs(html: string): { tag: string; label: string }[] {
	return [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)]
		.map((match) => ({ tag: match[1], label: match[2].trim() }))
		.filter((entry) => entry.tag.includes('role="tab"'));
}

function selected(html: string, label: string): boolean | undefined {
	const entry = tabs(html).find((tab) => tab.label === label);
	if (entry === undefined) return undefined;
	return entry.tag.includes('aria-selected="true"');
}

describe("the Changes / History / Blame strip", () => {
	test("is one tab list, so a screen reader reads tabs rather than a row of buttons", () => {
		expect(markup("changes", "/p/a.rs")).toContain('role="tablist"');
	});

	test("names its tabs and reports which one is current", () => {
		const html = markup("history", "/p/a.rs");
		expect(tabs(html).map((tab) => tab.label)).toEqual(["Changes", "History", "Blame"]);
		expect(selected(html, "History")).toBe(true);
		expect(selected(html, "Changes")).toBe(false);
		expect(selected(html, "Blame")).toBe(false);
	});

	test("Blame is not a tab until a file is open", () => {
		const html = markup("changes", null);
		expect(tabs(html).map((tab) => tab.label)).toEqual(["Changes", "History"]);
		expect(selected(html, "Changes")).toBe(true);
	});
});
