import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Diagnostic } from "@/lib/project/api";

mock.module("@/lib/project/api", () => ({
	onDiagnostics: async () => () => {},
	onSessionEnded: async () => () => {},
}));

import { useDiagnosticsState } from "@/ui/app/useDiagnosticsState";

function finding(path: string, message: string, source = "clangd"): Diagnostic {
	return {
		path,
		range: { start: { line: 3, character: 4 }, end: { line: 3, character: 9 } },
		severity: 1,
		message,
		source,
	};
}

function setup() {
	return renderHook(() =>
		useDiagnosticsState({ root: "/p", running: new Set(), onError: () => {} }),
	);
}

function messages(map: Map<string, Diagnostic[]>): string[] {
	return [...map.values()].flatMap((list) => list.map((diagnostic) => diagnostic.message));
}

afterEach(() => {
	cleanup();
});

describe("a rebuild", () => {
	test("replaces the whole build map, so a fixed file's old row goes", () => {
		const view = setup();
		act(() => view.result.current.setBuildReport([finding("/p/src/a.cpp", "old error")]));
		expect(messages(view.result.current.diagnostics)).toEqual(["old error"]);

		act(() => view.result.current.setBuildReport([finding("/p/src/b.cpp", "new error")]));

		expect(messages(view.result.current.diagnostics)).toEqual(["new error"]);
		expect(view.result.current.counts).toEqual({ errors: 1, warnings: 0 });
	});

	test("a clean rebuild empties the findings instead of keeping the last run's", () => {
		const view = setup();
		act(() => view.result.current.setBuildReport([finding("/p/src/a.cpp", "old error")]));

		act(() => view.result.current.setBuildReport([]));

		expect(view.result.current.diagnostics.size).toBe(0);
		expect(view.result.current.files).toEqual([]);
	});
});

describe("a changed buffer", () => {
	test("drops that file's build rows and leaves another file's alone", () => {
		const view = setup();
		act(() =>
			view.result.current.setBuildReport([
				finding("/p/src/a.cpp", "stale in a"),
				finding("/p/src/b.cpp", "current in b"),
			]),
		);

		act(() => view.result.current.applyEvent({ type: "text", path: "/p/src/a.cpp" }));

		expect([...view.result.current.diagnostics.keys()]).toEqual(["/p/src/b.cpp"]);
		expect(view.result.current.counts).toEqual({ errors: 1, warnings: 0 });
	});

	test("keeps the server's own row, which follows the text it describes", () => {
		const view = setup();
		act(() => view.result.current.publish("/p/src/a.cpp", [finding("/p/src/a.cpp", "live")]));
		act(() => view.result.current.setBuildReport([finding("/p/src/a.cpp", "stale")]));

		act(() => view.result.current.applyEvent({ type: "text", path: "/p/src/a.cpp" }));

		expect(messages(view.result.current.diagnostics)).toEqual(["live"]);
	});
});

describe("one problem from both sources", () => {
	test("is counted once, and the server's copy is the row", () => {
		const view = setup();
		act(() =>
			view.result.current.publish("/p/src/a.cpp", [
				finding("/p/src/a.cpp", "no member named 'x'", "clangd"),
			]),
		);
		act(() =>
			view.result.current.setBuildReport([
				finding("/p/src/a.cpp", "no member named 'x'", "clang"),
			]),
		);

		expect(view.result.current.diagnostics.get("/p/src/a.cpp")).toHaveLength(1);
		expect(view.result.current.counts).toEqual({ errors: 1, warnings: 0 });
	});
});
