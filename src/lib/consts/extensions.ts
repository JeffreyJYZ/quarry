/**
 * Which files belong to which language, in one place.
 *
 * The same fact was previously spelled five ways — a dotless set in `editor/languages`, another in
 * `files/fileKind`, dotted sets in `lsp/served` and `lsp/rootSignals`, and a regex in
 * `generate/model` — so a header that one table knew about was invisible to the other four. Extension
 * checks and the tables themselves come from here.
 */

/** C and C++ source and header extensions, without the leading dot. */
export const CPP_EXTENSIONS = ["c", "h", "cc", "cpp", "cxx", "hh", "hpp", "hxx"] as const;

/** Rust source extensions, without the leading dot. */
export const RUST_EXTENSIONS = ["rs"] as const;

const CPP = new Set<string>(CPP_EXTENSIONS);
const RUST = new Set<string>(RUST_EXTENSIONS);

/** Lowercased extension of a path without its dot, or `""` when there is none. */
export function extensionOf(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const base = normalized.slice(normalized.lastIndexOf("/") + 1);
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return "";
	return base.slice(dot + 1).toLowerCase();
}

export function isCppExtension(extension: string): boolean {
	return CPP.has(extension);
}

export function isRustExtension(extension: string): boolean {
	return RUST.has(extension);
}

/** Whether a path is a C or C++ source or header, by extension. */
export function isCppPath(path: string): boolean {
	return isCppExtension(extensionOf(path));
}

/** Whether a path is a Rust source file, by extension. */
export function isRustPath(path: string): boolean {
	return isRustExtension(extensionOf(path));
}

/** The same extensions with a leading dot, for the language-server tables. */
export function dotted(extensions: readonly string[]): string[] {
	return extensions.map((extension) => `.${extension}`);
}
