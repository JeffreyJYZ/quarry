import "@/test/dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";

type Loaded = {
	name: string;
	kind: number;
	range: { start: { line: number; character: number }; end: { line: number; character: number } };
	depth: number;
};

let handler: (session: string, path: string) => Promise<Loaded[]> = async () => {
	throw new Error("language server refused the request");
};
const loads: string[] = [];

mock.module("@/lib/project/api", () => ({
	lspSymbols: (session: string, path: string) => {
		loads.push(path);
		return handler(session, path);
	},
}));

import { setLspContext } from "@/lib/lsp/context";
import Breadcrumb from "@/ui/breadcrumb/Breadcrumb";

const MAIN: Loaded = {
	name: "main",
	kind: 12,
	range: { start: { line: 3, character: 0 }, end: { line: 9, character: 1 } },
	depth: 0,
};

beforeEach(() => {
	setLspContext(null, new Set());
	loads.length = 0;
});

afterEach(() => {
	cleanup();
});

describe("a breadcrumb whose symbol read fails", () => {
	test("keeps the path and names the failed operation instead of showing an empty chain", async () => {
		setLspContext("/p", new Set(["rust-analyzer"]));
		const view = render(
			<Breadcrumb
				root="/p"
				activePath="/p/src/main.rs"
				cursor={{ line: 1, character: 0 }}
				onNavigate={() => {}}
			/>,
		);

		await waitFor(() => expect(view.getByText(/symbols unavailable/)).toBeTruthy());
		expect(view.getByText(/symbols unavailable/).textContent).toContain(
			"language server refused the request",
		);
		expect(view.container.querySelectorAll(".breadcrumb-symbol").length).toBe(0);
		expect(view.getByText("main.rs")).toBeTruthy();
	});

	test("a session a restart tore down stays quiet, and the next running set asks again", async () => {
		handler = async (session) => {
			throw new Error(`no language server session for ${session}`);
		};
		act(() => setLspContext("/p", new Set(["clangd"])));
		const view = render(
			<Breadcrumb
				root="/p"
				activePath="/p/src/main.cpp"
				cursor={{ line: 3, character: 2 }}
				onNavigate={() => {}}
			/>,
		);

		await waitFor(() => expect(loads.length).toBe(1));
		await act(async () => {});
		expect(view.container.querySelector(".breadcrumb-error")).toBeNull();
		expect(view.container.querySelectorAll(".breadcrumb-symbol").length).toBe(0);

		// The failed attempt was not cached, so a change in the running set asks again and fills in.
		handler = async () => [MAIN];
		act(() => setLspContext("/p", new Set(["clangd", "rust-analyzer"])));

		await waitFor(() => expect(view.getByText("main")).toBeTruthy());
		expect(loads.length).toBe(2);
	});
});
