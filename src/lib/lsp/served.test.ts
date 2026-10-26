import { describe, expect, test } from "bun:test";
import { serverKindForProject, servesPath, servedExtensions } from "@/lib/lsp/served";

const RUST_TABLE = [".rs"];
const CLANG_TABLE = [".c", ".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp"];

describe("serverKindForProject", () => {
	test("cargo maps to rust-analyzer", () => {
		expect(serverKindForProject("cargo")).toBe("rust-analyzer");
	});
	test("everything else maps to clangd", () => {
		expect(serverKindForProject(null)).toBe("clangd");
		expect(serverKindForProject("cmake")).toBe("clangd");
	});
});

describe("servedExtensions", () => {
	test("one table per server", () => {
		expect(servedExtensions("rust-analyzer")).toEqual(RUST_TABLE);
		expect(servedExtensions("clangd")).toEqual(CLANG_TABLE);
	});
});

describe("servesPath", () => {
	test("rust-analyzer serves only .rs", () => {
		for (const ext of RUST_TABLE) {
			expect(servesPath("rust-analyzer", `/p/src/main${ext}`)).toBe(true);
		}
		for (const ext of CLANG_TABLE) {
			expect(servesPath("rust-analyzer", `/p/src/main${ext}`)).toBe(false);
		}
	});
	test("clangd serves its table", () => {
		for (const ext of CLANG_TABLE) {
			expect(servesPath("clangd", `/p/src/main${ext}`)).toBe(true);
		}
		for (const ext of RUST_TABLE) {
			expect(servesPath("clangd", `/p/src/main${ext}`)).toBe(false);
		}
	});
	test("uppercase extensions match", () => {
		expect(servesPath("rust-analyzer", "/p/src/MAIN.RS")).toBe(true);
		expect(servesPath("clangd", "/p/src/MAIN.CPP")).toBe(true);
	});
	test("nested paths and backslashes", () => {
		expect(servesPath("clangd", "C:\\proj\\src\\a\\b.cpp")).toBe(true);
		expect(servesPath("rust-analyzer", "/p/a/b/c/d.rs")).toBe(true);
	});
	test("rust-analyzer does not serve Cargo.toml, Cargo.lock or .gitignore", () => {
		expect(servesPath("rust-analyzer", "/p/Cargo.toml")).toBe(false);
		expect(servesPath("rust-analyzer", "/p/Cargo.lock")).toBe(false);
		expect(servesPath("rust-analyzer", "/p/.gitignore")).toBe(false);
	});
	test("header with no extension match is false", () => {
		expect(servesPath("clangd", "/p/README")).toBe(false);
		expect(servesPath("rust-analyzer", null)).toBe(false);
		expect(servesPath("clangd", "")).toBe(false);
	});
});
