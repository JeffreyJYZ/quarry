/** Which language server a project runs, and which files that server actually serves. */

export type ServerKind = "rust-analyzer" | "clangd";

const RUST_EXTENSIONS = [".rs"];
const CLANG_EXTENSIONS = [".c", ".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp"];

const EXTENSIONS: Record<ServerKind, readonly string[]> = {
	"rust-analyzer": RUST_EXTENSIONS,
	clangd: CLANG_EXTENSIONS,
};

export function serverKindForProject(kind: string | null): ServerKind {
	return kind === "cargo" ? "rust-analyzer" : "clangd";
}

export function extensionOf(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");
	const base = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
	const dot = base.lastIndexOf(".");
	if (dot <= 0) {
		return "";
	}
	return base.slice(dot).toLowerCase();
}

export function servesPath(kind: ServerKind, path: string | null): boolean {
	if (path === null || path === "") {
		return false;
	}
	const ext = extensionOf(path);
	return EXTENSIONS[kind].includes(ext);
}

export function servedExtensions(kind: ServerKind): readonly string[] {
	return EXTENSIONS[kind];
}
