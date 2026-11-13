import "@/test/dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ServerKind } from "@/lib/lsp/served";
import type { Diagnostic } from "@/lib/project/api";

type Publish = (event: { root: string; path: string; diagnostics: Diagnostic[] }) => void;
let publish: Publish | null = null;

mock.module("@/lib/project/api", () => ({
	onDiagnostics: async (handler: Publish) => {
		publish = handler;
		return () => {};
	},
	onSessionEnded: async () => () => {},
}));

// The wiring's own restart machinery is not what these tests are about: they prove the diagnostics
// store starts from nothing when the shell says a restart happened.
mock.module("@/ui/app/useLspWiring", () => ({
	useLspWiring: () => ({
		statuses: { "rust-analyzer": { phase: "ready" }, clangd: { phase: "absent" } },
		running: new Set(["rust-analyzer"]),
		markEnded: () => {},
	}),
}));

import { useShellDiagnostics } from "@/ui/app/useShellDiagnostics";

function finding(path: string, message: string): Diagnostic {
	return {
		path,
		range: { start: { line: 3, character: 4 }, end: { line: 3, character: 9 } },
		severity: 1,
		message,
		source: "clangd",
	};
}

const runningRef = { current: new Set<ServerKind>(["rust-analyzer"]) };

function setup(token: number) {
	return renderHook(
		(props: { token: number }) =>
			useShellDiagnostics({
				root: "/p",
				activePath: "/p/src/a.cpp",
				activeText: "",
				report: () => {},
				overrides: {},
				profile: "debug",
				runningRef,
				restartToken: props.token,
				onRestarted: () => {},
				onError: () => {},
			}),
		{ initialProps: { token } },
	);
}

function messages(view: ReturnType<typeof setup>): string[] {
	return [...view.result.current.diagnostics.diagnostics.values()].flatMap((list) =>
		list.map((diagnostic) => diagnostic.message),
	);
}

beforeEach(() => {
	publish = null;
});

afterEach(() => {
	cleanup();
});

describe("an LSP restart", () => {
	test("starts the server map from nothing and leaves the build rows", async () => {
		const view = setup(0);
		await waitFor(() => expect(publish).not.toBeNull());
		act(() =>
			publish?.({
				root: "/p",
				path: "/p/src/a.cpp",
				diagnostics: [finding("/p/src/a.cpp", "live")],
			}),
		);
		act(() =>
			view.result.current.diagnostics.setBuildReport([finding("/p/src/a.cpp", "built")]),
		);
		expect(messages(view)).toHaveLength(2);

		act(() => view.rerender({ token: 1 }));

		expect(messages(view)).toEqual(["built"]);
		expect(view.result.current.diagnostics.counts).toEqual({ errors: 1, warnings: 0 });
	});

	test("the replacement's next publish repopulates the file", async () => {
		const view = setup(0);
		await waitFor(() => expect(publish).not.toBeNull());
		act(() =>
			publish?.({
				root: "/p",
				path: "/p/src/a.cpp",
				diagnostics: [finding("/p/src/a.cpp", "old")],
			}),
		);
		act(() => view.rerender({ token: 1 }));
		expect(messages(view)).toEqual([]);

		act(() =>
			publish?.({
				root: "/p",
				path: "/p/src/a.cpp",
				diagnostics: [finding("/p/src/a.cpp", "new")],
			}),
		);

		expect(messages(view)).toEqual(["new"]);
	});
});
