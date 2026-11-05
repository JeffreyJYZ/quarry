import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickOpenResults } from "@/ui/quickopen/QuickOpenResults";

function markup(recentPaths: string[], primary = ""): string {
	return renderToStaticMarkup(
		QuickOpenResults({
			root: "/p",
			primary,
			active: 0,
			openPaths: new Set<string>(),
			recentPaths,
			mainList: ["/p/src/main.cpp"],
			ranked: primary === "" ? [] : ["/p/src/main.cpp"],
			onActive: () => {},
			onPick: () => {},
			listRef: { current: null },
		}),
	);
}

describe("quick open with no query", () => {
	test("drops the Recent group when nothing is recent", () => {
		const html = markup([]);
		expect(html).not.toContain(">Recent<");
		expect(html).toContain(">All files<");
	});

	test("keeps the Recent group once a file has been opened", () => {
		const html = markup(["/p/src/main.cpp"]);
		expect(html).toContain(">Recent<");
	});

	test("a query has no groups at all, only ranked rows", () => {
		const html = markup(["/p/src/main.cpp"], "main");
		expect(html).not.toContain(">Recent<");
		expect(html).not.toContain(">All files<");
	});
});
