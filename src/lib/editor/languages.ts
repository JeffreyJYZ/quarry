import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import type { Extension } from "@codemirror/state";

const CPP_EXTENSIONS = new Set(["c", "h", "cc", "cpp", "hpp", "cxx", "hh"]);

/** Language extension for a file path; plain text when the extension is unknown or absent. */
export function languageForPath(path: string | null): Extension {
	if (path === null) return [];
	const match = /\.([^./\\]+)$/.exec(path.toLowerCase());
	if (match === null) return [];
	const extension = match[1];
	if (extension === "rs") return rust();
	if (CPP_EXTENSIONS.has(extension)) return cpp();
	return [];
}
