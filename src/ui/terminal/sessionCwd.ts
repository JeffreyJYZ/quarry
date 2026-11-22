import { listDir } from "@/lib/project/api";

/**
 * Whether `path` still hosts a directory the backend can use.
 *
 * `list_dir` canonicalizes and refuses paths outside the open projects, so a failure means the cwd
 * can no longer be used — a deleted directory and one outside this project both lead to the root.
 */
export async function dirExists(path: string): Promise<boolean> {
	try {
		await listDir(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * The directory a restart reopens in: the shell's own cwd while it still exists, the root otherwise.
 *
 * A restart must not move a shell to wherever the editor happens to be pointing. The active file is
 * never consulted, and the project root is the only fallback.
 */
export async function restartCwd(
	stored: string | null | undefined,
	root: string,
	exists: (path: string) => Promise<boolean> = dirExists,
): Promise<string> {
	if (stored === null || stored === undefined) return root;
	return (await exists(stored)) ? stored : root;
}
