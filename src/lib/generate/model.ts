/**
 * The Generate menu: snippets computed from what is already in the file.
 *
 * Everything here is text in, text out, so the menu can be tested without an editor. Nothing is
 * inserted automatically; the caller applies the chosen item.
 */

export type GenerateItem = {
	id: string;
	label: string;
	/** Where the text goes: at the caret's line, or appended at the end of the file. */
	insert: "caret" | "end";
	text: string;
};

type Field = { name: string; type: string };

const RUST_FIELD = /^\s*pub\s+(\w+)\s*:\s*([^,]+),\s*$/;
const CPP_FIELD = /^\s*([\w:<>, *&]+?)\s+(\w+)(?:\s*=\s*[^;]+)?;\s*$/;

/** The `struct Name {` whose body contains the caret, if any. */
function enclosingStruct(
	lines: string[],
	caretLine: number,
): { name: string; fields: Field[] } | null {
	let open = -1;
	let name = "";
	for (let index = Math.min(caretLine, lines.length - 1); index >= 0; index -= 1) {
		const match = /^\s*(?:pub\s+)?struct\s+([A-Za-z_]\w*)/.exec(lines[index]);
		if (match !== null) {
			name = match[1];
			open = index;
			break;
		}
	}
	if (open === -1 || !lines[open].includes("{")) return null;
	// Only a caret inside the braces counts: otherwise the struct merely sits above.
	let depth = 0;
	for (let index = open; index <= caretLine; index += 1) {
		for (const char of lines[index]) {
			if (char === "{") depth += 1;
			if (char === "}") depth -= 1;
		}
		// The struct closed on an earlier line, so the caret is past it.
		if (depth <= 0 && index < caretLine) return null;
	}
	if (depth <= 0) return null;
	const fields: Field[] = [];
	for (let index = open + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (/^\s*}/.test(line)) break;
		const match = RUST_FIELD.exec(line);
		if (match !== null) fields.push({ name: match[1], type: match[2].trim() });
	}
	return { name, fields };
}

/** The C/C++ class whose body contains the caret, if any. */
function enclosingClass(
	lines: string[],
	caretLine: number,
): { name: string; fields: Field[] } | null {
	let open = -1;
	let name = "";
	for (let index = Math.min(caretLine, lines.length - 1); index >= 0; index -= 1) {
		const match = /^\s*(?:class|struct)\s+([A-Za-z_]\w*)\s*(?::[^{]*)?\{/.exec(lines[index]);
		if (match !== null) {
			name = match[1];
			open = index;
			break;
		}
	}
	if (open === -1) return null;
	let depth = 0;
	for (let index = open; index <= caretLine; index += 1) {
		for (const char of lines[index]) {
			if (char === "{") depth += 1;
			if (char === "}") depth -= 1;
		}
		if (depth <= 0 && index < caretLine) return null;
	}
	if (depth <= 0) return null;
	const fields: Field[] = [];
	for (let index = open + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (/^\s*};?\s*$/.test(line)) break;
		if (/^\s*(public|private|protected)\s*:/.test(line)) continue;
		const match = CPP_FIELD.exec(line);
		if (match !== null && !match[1].includes("(")) {
			fields.push({ name: match[2], type: match[1].trim() });
		}
	}
	return { name, fields };
}

/** Rust: an impl block with `new`, built from the struct's own fields. */
function rustImpl(struct: { name: string; fields: Field[] }, text: string): GenerateItem | null {
	if (new RegExp(`\\bimpl\\s+(?:<[^>]*>\\s*)?${struct.name}\\b`).test(text)) return null;
	const params = struct.fields.map((field) => `${field.name}: ${field.type}`).join(", ");
	const body =
		struct.fields.length === 0
			? `\n\tpub fn new() -> Self {\n\t\tSelf {}\n\t}\n`
			: `\n\tpub fn new(${params}) -> Self {\n\t\tSelf { ${struct.fields.map((field) => field.name).join(", ")} }\n\t}\n`;
	return {
		id: `impl-${struct.name}`,
		label: `Implement ${struct.name} with new()`,
		insert: "end",
		text: `\nimpl ${struct.name} {\n${body}}\n`,
	};
}

/** Rust: a test module appended once. */
function rustTests(text: string): GenerateItem | null {
	if (text.includes("#[cfg(test)]")) return null;
	return {
		id: "tests",
		label: "Test module",
		insert: "end",
		text: "\n#[cfg(test)]\nmod tests {\n\tuse super::*;\n\n\t#[test]\n\tfn it_works() {\n\t\tassert!(true);\n\t}\n}\n",
	};
}

/** C/C++: a constructor for the class the caret is in, defaulted from its fields. */
function cppConstructor(
	klass: { name: string; fields: Field[] },
	text: string,
): GenerateItem | null {
	if (new RegExp(`\\b${klass.name}\\s*\\(`).test(text)) return null;
	const initialisers =
		klass.fields.length === 0
			? ""
			: `\n    : ${klass.fields.map((field) => `${field.name}(${field.name})`).join(",\n      ")}`;
	const params = klass.fields.map((field) => `${field.type} ${field.name}`).join(", ");
	return {
		id: `ctor-${klass.name}`,
		label: `Constructor for ${klass.name}`,
		insert: "caret",
		text: `\n    ${klass.name}(${params})${initialisers} {}\n`,
	};
}

/** C/C++: `main`, appended when the file has none. */
function cppMain(text: string): GenerateItem | null {
	if (/\bint\s+main\s*\(/.test(text)) return null;
	return {
		id: "main",
		label: "main function",
		insert: "end",
		text: "\nint main() {\n\treturn 0;\n}\n",
	};
}

export function generateItems(path: string, text: string, caretLine: number): GenerateItem[] {
	const lines = text.split("\n");
	const items: (GenerateItem | null)[] = [];
	if (path.endsWith(".rs")) {
		const struct = enclosingStruct(lines, caretLine);
		if (struct !== null) items.push(rustImpl(struct, text));
		items.push(rustTests(text));
		return items.filter((item): item is GenerateItem => item !== null);
	}
	if (/\.(c|h|cc|cpp|cxx|hh|hpp)$/.test(path)) {
		const klass = enclosingClass(lines, caretLine);
		if (klass !== null) items.push(cppConstructor(klass, text));
		items.push(cppMain(text));
		return items.filter((item): item is GenerateItem => item !== null);
	}
	return [];
}
