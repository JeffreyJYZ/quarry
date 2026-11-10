import "@/test/dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";

type Loaded = {
	name: string;
	kind: number;
	range: { start: { line: number; character: number }; end: { line: number; character: number } };
	depth: number;
};

let mode: "ok" | "missing" | "real" = "ok";
const loads: { session: string; path: string }[] = [];

const MAIN: Loaded = {
	name: "main",
	kind: 12,
	range: { start: { line: 3, character: 0 }, end: { line: 9, character: 1 } },
	depth: 0,
};

mock.module("@/lib/project/api", () => ({
	lspSymbols: async (session: string, path: string) => {
		loads.push({ session, path });
		if (mode === "missing") throw new Error(`no language server session for ${session}`);
		if (mode === "real") throw new Error("clangd exited with status 1");
		return [MAIN];
	},
}));

import { setLspContext } from "@/lib/lsp/context";
import Outline from "@/ui/outline/Outline";

beforeEach(() => {
	setLspContext(null, new Set());
	mode = "ok";
	loads.length = 0;
});

afterEach(() => {
	cleanup();
});

describe("an outline whose server is still starting", () => {
	test("asks nothing until a server runs, then lists the symbols it answers", async () => {
		const view = render(
			<Outline root="/p" activePath="/p/src/main.cpp" onNavigate={() => {}} />,
		);

		expect(view.getByText("No language server for this file")).toBeTruthy();
		expect(loads.length).toBe(0);

		act(() => setLspContext("/p", new Set(["clangd"])));

		await waitFor(() => expect(view.getByText("main")).toBeTruthy());
		expect(loads).toEqual([{ session: "clangd::/p", path: "/p/src/main.cpp" }]);
	});

	test("a file no server serves is quiet, never an error, and costs no request", async () => {
		act(() => setLspContext("/p", new Set(["clangd"])));
		const view = render(<Outline root="/p" activePath="/p/notes.md" onNavigate={() => {}} />);

		expect(view.getByText("No language server for this file")).toBeTruthy();
		await Bun.sleep(400);
		expect(loads.length).toBe(0);
		expect(view.container.querySelector(".tree-note.error")).toBeNull();
	});
});

describe("an outline whose symbol read fails", () => {
	test("a session a restart tore down leaves the panel quiet", async () => {
		mode = "missing";
		act(() => setLspContext("/p", new Set(["clangd"])));
		const view = render(
			<Outline root="/p" activePath="/p/src/main.cpp" onNavigate={() => {}} />,
		);

		await waitFor(() => expect(loads.length).toBe(1));
		await waitFor(() =>
			expect(view.getByText("No language server for this file")).toBeTruthy(),
		);
		expect(view.container.querySelector(".tree-note.error")).toBeNull();
	});

	test("a real failure is still shown", async () => {
		mode = "real";
		act(() => setLspContext("/p", new Set(["clangd"])));
		const view = render(
			<Outline root="/p" activePath="/p/src/main.cpp" onNavigate={() => {}} />,
		);

		await waitFor(() => {
			expect(view.container.querySelector(".tree-note.error")?.textContent).toContain(
				"clangd exited with status 1",
			);
		});
	});
});
