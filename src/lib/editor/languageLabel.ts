import { languageNameForPath } from "@/lib/editor/languages";

/** The short language name the status bar shows for a path. */
export function languageLabel(path: string | null): string | null {
	if (path === null) return null;
	const name = languageNameForPath(path);
	if (name !== null) return name;
	const dot = path.lastIndexOf(".");
	if (dot === -1) return null;
	return path.slice(dot + 1).toLowerCase();
}
