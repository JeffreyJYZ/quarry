/**
 * The document version each path's text was last sent to its server with.
 *
 * A `WorkspaceEdit` names the version it was computed against. Comparing that number with the one
 * recorded here is what tells a stale rename from a current one. The server assigns these numbers,
 * so the acknowledgement of `lsp_open_document` / `lsp_change_document` is the only writer.
 */

const versions = new Map<string, number>();

/** Record the version the server acknowledged for `path`'s current text. */
export function setDocumentVersion(path: string, version: number): void {
	versions.set(path, version);
}

/** The version the server last acknowledged for `path`, or `null` when it has none. */
export function documentVersionOf(path: string): number | null {
	return versions.get(path) ?? null;
}

/** The path is no longer open on any server, so its recorded version describes nothing. */
export function forgetDocumentVersion(path: string): void {
	versions.delete(path);
}
