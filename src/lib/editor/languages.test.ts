import { describe, expect, test } from "bun:test";
import { languageForPath, languageNameForPath } from "@/lib/editor/languages";
import { languageLabel } from "@/lib/editor/languageLabel";

const CASES: Array<{ path: string; name: string | null; extEmpty: boolean }> = [
	{ path: "src/main.rs", name: "rust", extEmpty: false },
	{ path: "src/lib.cpp", name: "c++", extEmpty: false },
	{ path: "Cargo.toml", name: "toml", extEmpty: false },
	{ path: "Cargo.lock", name: "toml", extEmpty: false },
	{ path: "Cargo.toml.orig", name: "toml", extEmpty: false },
	{ path: "Gopkg.lock", name: "toml", extEmpty: false },
	{ path: "Pipfile", name: "toml", extEmpty: false },
	{ path: "pdm.lock", name: "toml", extEmpty: false },
	{ path: "poetry.lock", name: "toml", extEmpty: false },
	{ path: "uv.lock", name: "toml", extEmpty: false },
	{ path: ".cargo/config", name: "toml", extEmpty: false },
	{ path: "config.json", name: "json", extEmpty: false },
	{ path: "tsconfig.json", name: "json", extEmpty: false },
	{ path: "settings.jsonc", name: "json", extEmpty: false },
	{ path: "foo.json5", name: "json", extEmpty: false },
	{ path: "config.yaml", name: "yaml", extEmpty: false },
	{ path: "config.yml", name: "yaml", extEmpty: false },
	{ path: "CARGO.TOML", name: "toml", extEmpty: false },
	{ path: "unknown.xyz", name: null, extEmpty: true },
];

describe("languageForPath", () => {
	for (const c of CASES) {
		test(c.path, () => {
			const ext = languageForPath(c.path);
			if (c.extEmpty) expect(ext).toEqual([]);
			else expect(ext).not.toEqual([]);
			expect(languageNameForPath(c.path)).toBe(c.name);
			expect(languageLabel(c.path)).toBe(
				c.name ?? c.path.slice(c.path.lastIndexOf(".") + 1).toLowerCase(),
			);
		});
	}
});

describe("bare filenames", () => {
	test("no dot", () => {
		expect(languageNameForPath("Pipfile")).toBe("toml");
		expect(languageForPath("Pipfile")).not.toEqual([]);
	});
});
