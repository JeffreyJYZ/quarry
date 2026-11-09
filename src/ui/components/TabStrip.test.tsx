import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FileBuffer } from "@/lib/project/buffer";
import TabStrip from "@/ui/components/TabStrip";

const buffers: FileBuffer[] = [
	{ path: "/p/a.rs", name: "a.rs", text: "a", loaded: "a" },
	{ path: "/p/b.rs", name: "b.rs", text: "b", loaded: "b" },
];

function markup(activePath: string | null): string {
	return renderToStaticMarkup(
		<TabStrip
			buffers={buffers}
			activePath={activePath}
			saving={new Set()}
			confirmClose={null}
			onActivate={() => {}}
			onClose={() => {}}
			onSaveClose={() => {}}
			onDiscardClose={() => {}}
			onCancelClose={() => {}}
		/>,
	);
}

/** The opening tags of the elements the strip marks as tabs, so a close button is not counted. */
function tabTags(html: string): string[] {
	return html
		.split("<button")
		.slice(1)
		.map((rest) => rest.slice(0, rest.indexOf(">")))
		.filter((tag) => tag.includes('role="tab"'));
}

function tabFor(html: string, path: string): string | undefined {
	return tabTags(html).find((tag) => tag.includes(`title="${path}"`));
}

describe("the open-file tab strip", () => {
	test("is one tab list, so a screen reader reads tabs rather than divs", () => {
		expect(markup("/p/a.rs")).toContain('role="tablist"');
	});

	test("every open file is a tab", () => {
		expect(tabTags(markup("/p/a.rs"))).toHaveLength(buffers.length);
	});

	test("the active file is the selected tab, and only it", () => {
		const html = markup("/p/a.rs");
		expect(tabFor(html, "/p/a.rs")).toContain('aria-selected="true"');
		expect(tabFor(html, "/p/b.rs")).toContain('aria-selected="false"');
	});

	test("selection follows the active path rather than the first tab", () => {
		const html = markup("/p/b.rs");
		expect(tabFor(html, "/p/a.rs")).toContain('aria-selected="false"');
		expect(tabFor(html, "/p/b.rs")).toContain('aria-selected="true"');
	});
});

afterEach(() => {
	cleanup();
});

describe("the open-file tab strip keyboard model", () => {
	function strip() {
		const onActivate = mock((_path: string) => {});
		const view = render(
			<TabStrip
				buffers={buffers}
				activePath="/p/a.rs"
				saving={new Set()}
				confirmClose={null}
				onActivate={onActivate}
				onClose={() => {}}
				onSaveClose={() => {}}
				onDiscardClose={() => {}}
				onCancelClose={() => {}}
			/>,
		);
		return { view, onActivate };
	}

	test("only the selected tab owns the tab stop", () => {
		const { view } = strip();
		const tabs = view.getAllByRole("tab");
		expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1"]);
	});

	test("arrows step and wrap, Home and End jump to the ends", () => {
		const { view, onActivate } = strip();
		const first = view.getAllByRole("tab")[0] as HTMLElement;

		fireEvent.keyDown(first, { key: "ArrowRight" });
		expect(onActivate).toHaveBeenLastCalledWith("/p/b.rs");

		fireEvent.keyDown(first, { key: "ArrowLeft" });
		expect(onActivate).toHaveBeenLastCalledWith("/p/b.rs");

		fireEvent.keyDown(first, { key: "Home" });
		expect(onActivate).toHaveBeenLastCalledWith("/p/a.rs");

		fireEvent.keyDown(first, { key: "End" });
		expect(onActivate).toHaveBeenLastCalledWith("/p/b.rs");
	});
});
