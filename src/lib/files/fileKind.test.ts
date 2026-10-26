import { describe, expect, test } from "bun:test";
import { fileKind } from "@/lib/files/fileKind";

describe("fileKind", () => {
	test("known file names", () => {
		expect(fileKind("Cargo.toml")).toBe("toml");
		expect(fileKind("Cargo.lock")).toBe("lock");
		expect(fileKind("package.json")).toBe("json");
		expect(fileKind("tsconfig.json")).toBe("json");
		expect(fileKind("Makefile")).toBe("generic");
		expect(fileKind("CMakeLists.txt")).toBe("generic");
		expect(fileKind(".gitignore")).toBe("git");
		expect(fileKind(".gitmodules")).toBe("git");
		expect(fileKind("rust-toolchain.toml")).toBe("toml");
		expect(fileKind("README.md")).toBe("markdown");
	});

	test("build.rs is rust", () => {
		expect(fileKind("build.rs")).toBe("rust");
	});

	test("extension case-insensitivity", () => {
		expect(fileKind("Foo.RS")).toBe("rust");
		expect(fileKind("X.CPP")).toBe("cpp");
		expect(fileKind("A.Md")).toBe("markdown");
	});

	test("unknown extension is generic", () => {
		expect(fileKind("foo.xyz")).toBe("generic");
	});

	test("bare name with no dot is generic", () => {
		expect(fileKind("Makefile")).toBe("generic");
		expect(fileKind("noext")).toBe("generic");
	});

	test("dotted hidden file .gitignore", () => {
		expect(fileKind(".gitignore")).toBe("git");
	});
});
