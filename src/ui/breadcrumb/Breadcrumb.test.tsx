import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";

mock.module("@/lib/project/api", () => ({
	lspSymbols: async () => {
		throw new Error("language server refused the request");
	},
}));

import Breadcrumb from "@/ui/breadcrumb/Breadcrumb";

afterEach(() => {
	cleanup();
});

describe("a breadcrumb whose symbol read fails", () => {
	test("keeps the path and names the failed operation instead of showing an empty chain", async () => {
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
});
