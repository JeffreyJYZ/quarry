/** Which language server a project runs, and which files that server actually serves. */

import { CPP_EXTENSIONS, RUST_EXTENSIONS, dotted, extensionOf } from "@/lib/consts/extensions";
import { ALL_SERVER_KINDS, SESSION_SEPARATOR } from "@/lib/consts/lsp";
export type ServerKind = "rust-analyzer" | "clangd";

const EXTENSIONS: Record<ServerKind, readonly string[]> = {
	"rust-analyzer": dotted(RUST_EXTENSIONS),
	clangd: dotted(CPP_EXTENSIONS),
};

export { extensionOf };

/** The extension with its dot, which is the form the tables above use. */
function dottedExtensionOf(path: string): string {
	const extension = extensionOf(path);
	return extension === "" ? "" : `.${extension}`;
}

export function servesPath(kind: ServerKind, path: string | null): boolean {
	if (path === null || path === "") {
		return false;
	}
	const ext = dottedExtensionOf(path);
	return ext !== "" && EXTENSIONS[kind].includes(ext);
}

export function servedExtensions(kind: ServerKind): readonly string[] {
	return EXTENSIONS[kind];
}

/** Whether a server name that arrived over the wire is one this build knows. */
export function isServerKind(value: string): value is ServerKind {
	return (ALL_SERVER_KINDS as readonly string[]).includes(value);
}

/** Compose the session id a server is keyed by. Single source of truth. */
export function sessionId(kind: ServerKind, root: string): string {
	return `${kind}${SESSION_SEPARATOR}${root}`;
}

/** Whether a string is a composed session id (`{kind}::{root}`), not a bare path. */
export function isSessionId(value: string): boolean {
	const separator = value.indexOf(SESSION_SEPARATOR);
	if (separator <= 0) return false;
	return value.slice(separator + SESSION_SEPARATOR.length).length > 0;
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
	const ext = dottedExtensionOf(path);
	for (const kind of Object.keys(EXTENSIONS) as ServerKind[]) {
		if (EXTENSIONS[kind].includes(ext)) {
			return kind;
		}
	}
	return null;
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
