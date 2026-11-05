import { describe, expect, test } from "bun:test";
import { languageNameForPath } from "@/lib/editor/languages";
import { fileKind } from "@/lib/files/fileKind";
import {
	CPP_EXTENSIONS,
	RUST_EXTENSIONS,
	extensionOf,
	isCppPath,
	isRustPath,
} from "@/lib/consts/extensions";
import { servedExtensions, servesPath, serverKindForPath } from "@/lib/lsp/served";
import { generateItems } from "@/lib/generate/model";

describe("extensionOf", () => {
	test("dotless and lowercased", () => {
		expect(extensionOf("/p/src/Main.RS")).toBe("rs");
		expect(extensionOf("a/b/widget.HPP")).toBe("hpp");
	});

	test("backslashes and nested paths", () => {
		expect(extensionOf("C:\\proj\\src\\a\\b.cpp")).toBe("cpp");
	});

	test("no extension, dotfiles and trailing dots", () => {
		expect(extensionOf("/p/README")).toBe("");
		expect(extensionOf("/p/.gitignore")).toBe("");
		expect(extensionOf("/p/archive.")).toBe("");
	});
});

describe("every consumer agrees about one table", () => {
	test("each C/C++ extension is classified, highlighted and served", () => {
		for (const extension of CPP_EXTENSIONS) {
			const path = `/p/src/unit.${extension}`;
			expect(isCppPath(path)).toBe(true);
			expect(fileKind(`unit.${extension}`)).not.toBe("generic");
			expect(languageNameForPath(path)).toBe("c++");
			expect(servesPath("clangd", path)).toBe(true);
			expect(servesPath("rust-analyzer", path)).toBe(false);
			expect(serverKindForPath(path)).toBe("clangd");
			expect(servedExtensions("clangd")).toContain(`.${extension}`);
		}
	});

	test("each Rust extension is classified, highlighted and served", () => {
		for (const extension of RUST_EXTENSIONS) {
			const path = `/p/src/lib.${extension}`;
			expect(isRustPath(path)).toBe(true);
			expect(fileKind(`lib.${extension}`)).toBe("rust");
			expect(languageNameForPath(path)).toBe("rust");
			expect(servesPath("rust-analyzer", path)).toBe(true);
			expect(servesPath("clangd", path)).toBe(false);
			expect(serverKindForPath(path)).toBe("rust-analyzer");
		}
	});

	test("a header that only one table used to know about is served everywhere", () => {
		expect(languageNameForPath("/p/vec.hxx")).toBe("c++");
		expect(servesPath("clangd", "/p/vec.hxx")).toBe(true);
		expect(fileKind("vec.hxx")).toBe("cpp");
	});

	test("generate offers C++ items for the same extensions", () => {
		const cpp = generateItems("/p/src/unit.hxx", "class Widget {};\n", 0);
		expect(cpp.length).toBeGreaterThan(0);
		expect(generateItems("/p/src/unit.txt", "class Widget {};\n", 0)).toEqual([]);
	});
});
