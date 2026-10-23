import { describe, expect, test } from "bun:test";
import { isInsideRoot, lspErrorMessage } from "@/lib/lsp/paths";

describe("isInsideRoot", () => {
	test("a path under the root is inside", () => {
		expect(isInsideRoot("/p/demo", "/p/demo/src/main.rs")).toBe(true);
	});

	test("the root itself is inside", () => {
		expect(isInsideRoot("/p/demo", "/p/demo")).toBe(true);
	});

	test("a sibling with a shared prefix is not inside", () => {
		expect(isInsideRoot("/p/demo", "/p/demo-2/src/main.rs")).toBe(false);
	});

	test("a path above the root is not inside", () => {
		expect(isInsideRoot("/p/demo", "/p/other/src/main.rs")).toBe(false);
	});

	test("empty values are not inside", () => {
		expect(isInsideRoot("", "/p/demo/src/main.rs")).toBe(false);
		expect(isInsideRoot("/p/demo", "")).toBe(false);
	});

	test("a trailing slash on the root still matches", () => {
		expect(isInsideRoot("/p/demo/", "/p/demo/src/main.rs")).toBe(true);
	});
});

describe("lspErrorMessage", () => {
	test("rust-analyzer's file-not-found becomes one readable line", () => {
		const raw =
			'rust-analyzer rejected textDocument/documentSymbol: {"code":-32603,"message":"file not found: /p/demo/src/main.rs"}';
		expect(lspErrorMessage(raw)).toContain("not indexing this file");
	});

	test("clangd's wording maps to the same line", () => {
		expect(lspErrorMessage("file is not among the indexed files")).toContain(
			"not indexing this file",
		);
	});

	test("an unopened document keeps a distinct message", () => {
		expect(lspErrorMessage("document not open")).toContain("has not opened this file");
	});

	test("anything else passes through untouched", () => {
		expect(lspErrorMessage("server crashed")).toBe("server crashed");
	});
});
