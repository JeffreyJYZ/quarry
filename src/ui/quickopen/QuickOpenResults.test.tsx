import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickOpenResults } from "@/ui/quickopen/QuickOpenResults";

type Props = Parameters<typeof QuickOpenResults>[0];

function baseProps(primary = ""): Props {
	return {
		root: "/p",
		primary,
		active: 0,
		openPaths: new Set<string>(),
		recentPaths: [],
		mainList: ["/p/src/main.cpp"],
		ranked: primary === "" ? [] : ["/p/src/main.cpp"],
		onActive: () => {},
		onPick: () => {},
		listRef: { current: null },
	};
}

function markup(recentPaths: string[], primary = ""): string {
	return renderToStaticMarkup(
		<QuickOpenResults
			{...baseProps(primary)}
			recentPaths={recentPaths}
			onActive={() => {}}
			onPick={() => {}}
		/>,
	);
}

afterEach(() => {
	cleanup();
});

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

describe("quick open rows", () => {
	test("a row keeps one stable handler and calls the newest one after a re-render", () => {
		const first = mock((_path: string) => {});
		const second = mock((_path: string) => {});
		const view = render(<QuickOpenResults {...baseProps()} onPick={first} />);

		view.rerender(<QuickOpenResults {...baseProps()} onPick={second} />);
		fireEvent.click(view.getByTitle("/p/src/main.cpp"));

		expect(second).toHaveBeenCalledWith("/p/src/main.cpp");
		expect(first).not.toHaveBeenCalled();
	});

	test("hovering a row reports its index to the shared handler", () => {
		const onActive = mock((_index: number) => {});
		const view = render(<QuickOpenResults {...baseProps()} onActive={onActive} />);

		fireEvent.mouseEnter(view.getByTitle("/p/src/main.cpp"));

		expect(onActive).toHaveBeenCalledWith(0);
	});
});
