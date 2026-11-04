import { describe, expect, test } from "bun:test";
import { semanticClass } from "@/lib/editor/semanticTokens";

/**
 * These shapes are what clangd actually sent for a real C++ file, captured from its own legend
 * (`classScope`, `fileScope`, `globalScope`, `static`, `readonly`, `deduced`). A guess here would
 * be a colour on the wrong token, so each case names the construct it came from.
 */
const token = (kind: string, modifiers: string[] = []) => ({
	line: 0,
	start: 0,
	length: 1,
	kind,
	modifiers,
});

describe("semanticClass", () => {
	test("a local variable keeps the grammar's identifier colour", () => {
		expect(
			semanticClass(token("variable", ["declaration", "definition", "functionScope"])),
		).toBe(null);
	});

	test("an instance field, a static field and an enum constant are three classes", () => {
		const field = semanticClass(token("property", ["declaration", "classScope"]));
		const staticField = semanticClass(
			token("variable", ["declaration", "static", "classScope"]),
		);
		const enumConstant = semanticClass(
			token("enumMember", ["declaration", "readonly", "classScope"]),
		);
		expect(new Set([field, staticField, enumConstant]).size).toBe(3);
		expect(field).toBe("cm-sem-property");
		expect(staticField).toBe("cm-sem-static-field");
		expect(enumConstant).toBe("cm-sem-enum");
	});

	test("a constant wins over the storage it happens to have", () => {
		// `static constexpr int kInline` and a file-scope `const int kGlobal`.
		expect(semanticClass(token("variable", ["readonly", "static", "classScope"]))).toBe(
			"cm-sem-constant",
		);
		expect(semanticClass(token("variable", ["declaration", "readonly", "fileScope"]))).toBe(
			"cm-sem-constant",
		);
	});

	test("a global variable is not a local", () => {
		expect(semanticClass(token("variable", ["declaration", "globalScope"]))).toBe(
			"cm-sem-global",
		);
		expect(semanticClass(token("variable", ["static", "fileScope"]))).toBe("cm-sem-global");
	});

	test("a declaration and a call of a function differ", () => {
		expect(semanticClass(token("function", ["declaration", "definition", "globalScope"]))).toBe(
			"cm-sem-function-decl",
		);
		expect(semanticClass(token("function", ["globalScope"]))).toBe("cm-sem-function");
		expect(semanticClass(token("method", ["classScope"]))).toBe("cm-sem-function");
	});

	test("a label is its own class", () => {
		expect(semanticClass(token("label", ["declaration", "functionScope"]))).toBe(
			"cm-sem-label",
		);
	});

	test("`auto` is left to the grammar even though clangd calls it an enum", () => {
		expect(semanticClass(token("enum", ["deduced", "classScope"]))).toBeNull();
	});

	test("a parameter and a type keep their classes", () => {
		expect(semanticClass(token("parameter", ["functionScope"]))).toBe("cm-sem-parameter");
		expect(semanticClass(token("class", ["declaration", "definition"]))).toBe("cm-sem-type");
	});
});
