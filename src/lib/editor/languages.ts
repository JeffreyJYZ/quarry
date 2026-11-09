import { cpp } from "@codemirror/lang-cpp";
import { json } from "@codemirror/lang-json";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import type { Extension } from "@codemirror/state";
import { isCppExtension, isRustExtension } from "@/lib/consts/extensions";
import { fileName, normalizePath } from "@/lib/project/paths";

const TOML_FILENAMES = new Set([
	"cargo.lock",
	"cargo.toml.orig",
	"gopkg.lock",
	"pipfile",
	"pdm.lock",
	"poetry.lock",
	"uv.lock",
]);

export function languageNameForPath(path: string | null): string | null {
	if (path === null) return null;
	const normalized = normalizePath(path);
	const lower = normalized.toLowerCase();
	const base = fileName(lower);

	if (TOML_FILENAMES.has(base)) return "toml";
	if (lower === ".cargo/config" || lower.endsWith("/.cargo/config")) return "toml";

	const dot = base.lastIndexOf(".");
	const extension = dot === -1 ? "" : base.slice(dot + 1);
	if (extension === "toml") return "toml";
	if (isRustExtension(extension)) return "rust";
	if (isCppExtension(extension)) return "c++";
	if (extension === "json" || extension === "jsonc" || extension === "json5") return "json";
	if (extension === "yaml" || extension === "yml") return "yaml";
	return null;
}

export function languageForPath(path: string | null): Extension {
	const name = languageNameForPath(path);
	if (name === "toml") return StreamLanguage.define(toml);
	if (name === "yaml") return StreamLanguage.define(yaml);
	if (name === "json") return json();
	if (name === "rust") return rust();
	if (name === "c++") return cpp();
	return [];
}
