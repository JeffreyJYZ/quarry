/**
 * Two guards for language-server calls.
 *
 * A server indexes one project root; asking it about a path outside that root, or about a file that
 * no longer exists on disk, gets an internal-error reply that is meaningless in the UI. These helpers
 * keep such requests from being made and turn the ones that still fail into one readable line.
 */

/** True when `path` is `root` itself or sits underneath it. */
export function isInsideRoot(root: string, path: string): boolean {
	if (root === "" || path === "") return false;
	const prefix = root.endsWith("/") ? root : `${root}/`;
	return path === root || path.startsWith(prefix);
}

/**
 * The user-facing text for a failed language-server call.
 *
 * rust-analyzer answers an unknown file with `-32603 file not found: <path>`; clangd says the file
 * is not among the indexed ones. Both mean the same thing to the user, so both read the same here.
 */
export function lspErrorMessage(message: string): string {
	const text = message.toLowerCase();
	if (text.includes("file not found") || text.includes("not among the indexed")) {
		return "The language server is not indexing this file (it is outside the project or gone from disk).";
	}
	if (text.includes("file not open") || text.includes("document not open")) {
		return "The language server has not opened this file yet.";
	}
	return message;
}
