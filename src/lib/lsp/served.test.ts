import { describe, expect, test } from "bun:test";
import {
	servesPath,
	servedExtensions,
	servedByRunningServer,
	sessionForPath,
	isSessionId,
} from "@/lib/lsp/served";

const RUST_TABLE = [".rs"];
const CLANG_TABLE = [".c", ".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp"];

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

describe("servedByRunningServer", () => {
	test("served and running", () => {
		expect(servedByRunningServer("/p/src/main.rs", new Set(["rust-analyzer"]))).toBe(
			"rust-analyzer",
		);
	});
	test("served but not running", () => {
		expect(servedByRunningServer("/p/src/main.c", new Set(["rust-analyzer"]))).toBeNull();
	});
	test("unsupported extension", () => {
		expect(servedByRunningServer("/p/README", new Set(["rust-analyzer", "clangd"]))).toBeNull();
	});
	test("null path", () => {
		expect(servedByRunningServer(null, new Set(["rust-analyzer"]))).toBeNull();
	});
});

describe("sessionForPath", () => {
	test(".rs with rust running returns id", () => {
		expect(sessionForPath("/p/src/main.rs", new Set(["rust-analyzer"]), "/root")).toBe(
			"rust-analyzer::/root",
		);
	});
	test(".c with clangd running returns id", () => {
		expect(sessionForPath("/p/src/main.c", new Set(["clangd"]), "/root")).toBe("clangd::/root");
	});
	test(".c with only rust running returns null", () => {
		expect(sessionForPath("/p/src/main.c", new Set(["rust-analyzer"]), "/root")).toBeNull();
	});
	test(".toml returns null", () => {
		expect(
			sessionForPath("/p/Cargo.toml", new Set(["rust-analyzer", "clangd"]), "/root"),
		).toBeNull();
	});
	test("two kinds produce different ids", () => {
		const rust = sessionForPath("/p/src/main.rs", new Set(["rust-analyzer"]), "/root");
		const c = sessionForPath("/p/src/main.c", new Set(["clangd"]), "/root");
		expect(rust).not.toBe(c);
	});
});

describe("isSessionId", () => {
	test("composed id is a session id", () => {
		expect(isSessionId("rust-analyzer::/root")).toBe(true);
		expect(isSessionId("clangd::/root")).toBe(true);
	});
	test("bare path is not", () => {
		expect(isSessionId("/Users/jyz/dev/langs/rust/hi")).toBe(false);
		expect(isSessionId("/root")).toBe(false);
	});
	test("composed id with empty root is rejected", () => {
		expect(isSessionId("rust-analyzer::")).toBe(false);
		expect(isSessionId("clangd::")).toBe(false);
	});
	test("null session short-circuits feature", () => {
		expect(sessionForPath("/p/src/main.rs", new Set(), "/root")).toBeNull();
	});
});
