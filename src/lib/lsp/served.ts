/** Which language server a project runs, and which files that server actually serves. */

export type ServerKind = "rust-analyzer" | "clangd";

const RUST_EXTENSIONS = [".rs"];
const CLANG_EXTENSIONS = [".c", ".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp"];

const EXTENSIONS: Record<ServerKind, readonly string[]> = {
	"rust-analyzer": RUST_EXTENSIONS,
	clangd: CLANG_EXTENSIONS,
};

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

/** Compose the session id a server is keyed by. Single source of truth. */
export function sessionId(kind: ServerKind, root: string): string {
	return `${kind}::${root}`;
}

/** Whether a string is a composed session id (`{kind}::{root}`), not a bare path. */
export function isSessionId(value: string): boolean {
	const separator = value.indexOf("::");
	if (separator <= 0) return false;
	return value.slice(separator + 2).length > 0;
}

/** Which servers should run for a root, from what is actually there. */
export type RootSignals = {
	hasCargoToml: boolean;
	hasCompileCommands: boolean;
	hasCMakeLists: boolean;
	hasCppFiles: boolean;
};

export function serversForRoot(signals: RootSignals): ServerKind[] {
	const out: ServerKind[] = [];
	if (signals.hasCargoToml) {
		out.push("rust-analyzer");
	}
	if (signals.hasCompileCommands || signals.hasCMakeLists || signals.hasCppFiles) {
		out.push("clangd");
	}
	return out;
}

/** Server kind serving a given path, if any. */
export function serverKindForPath(path: string | null): ServerKind | null {
	if (path === null || path === "") {
		return null;
	}
	const ext = extensionOf(path);
	for (const kind of Object.keys(EXTENSIONS) as ServerKind[]) {
		if (EXTENSIONS[kind].includes(ext)) {
			return kind;
		}
	}
	return null;
}

/** Whether any running language server serves this path, by extension alone. */
export function servesAny(path: string | null): boolean {
	return serverKindForPath(path) !== null;
}

/** The kind serving `path` when that kind is running; otherwise null. */
export function servedByRunningServer(
	path: string | null,
	running: ReadonlySet<ServerKind>,
): ServerKind | null {
	const kind = serverKindForPath(path);
	if (kind === null) {
		return null;
	}
	return running.has(kind) ? kind : null;
}

/** Session id for the running server serving `path`, or null when none. */
export function sessionForPath(
	path: string | null,
	running: ReadonlySet<ServerKind>,
	root: string,
): string | null {
	const kind = servedByRunningServer(path, running);
	if (kind === null) {
		return null;
	}
	return sessionId(kind, root);
}
