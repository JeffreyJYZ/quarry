/**
 * Filesystem paths as the backend hands them over.
 *
 * macOS and Linux report POSIX paths; a Windows build reports backslash paths and drive letters. The
 * helpers here accept either separator, so a tab label, breadcrumb or refresh target is never built
 * from half a path. A URI is not a filesystem path and stays out of scope: URLs keep their `/`.
 */

/** Both separators are accepted everywhere; comparing two paths normalizes to `/`. */
export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}

/** The separator `path` last used, so a child is joined in its parent's own style. */
export function separatorOf(path: string): string {
	return path.lastIndexOf("\\") > path.lastIndexOf("/") ? "\\" : "/";
}

/** A drive root (`C:\`, `C:/`, `C:`) or a separator-only root (`/`, `\`). */
function isRootPath(path: string): boolean {
	return /^[\\/]+$/.test(path) || /^[A-Za-z]:[\\/]?$/.test(path);
}

/** `path` without trailing separators, except where the whole path is a root. */
export function trimTrailingSeparators(path: string): string {
	if (path === "" || isRootPath(path)) return path;
	return path.replace(/[\\/]+$/, "");
}

/** Whether `path` is absolute: a leading separator, a drive letter, or a UNC share. */
export function isAbsolute(path: string): boolean {
	return /^[\\/]/.test(path) || /^[A-Za-z]:[\\/]/.test(path);
}

/** The last segment of `path`; `""` for a bare root, which has no name of its own. */
export function fileName(path: string): string {
	const trimmed = trimTrailingSeparators(path);
	const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

/**
 * The directory above `path`, or `null` when there is none to refresh.
 *
 * A path directly under its root (`/proj`, `C:\proj`) counts as top-level: the root's own listing is
 * the one to re-read, and `C:` is never a directory that can be listed on its own.
 */
export function parentDir(path: string): string | null {
	const trimmed = trimTrailingSeparators(path);
	if (trimmed === "" || isRootPath(trimmed)) return null;
	const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	if (cut <= 0) return null;
	if (/^[A-Za-z]:[\\/]/.test(trimmed) && cut === 2) return null;
	return trimmed.slice(0, cut);
}

/** The directory part of `path`, or `""` when it has none. */
export function directoryOf(path: string): string {
	return parentDir(path) ?? "";
}

/** `parent` plus one segment, in `parent`'s own separator style. */
export function joinPath(parent: string, name: string): string {
	if (parent === "") return name;
	const base = trimTrailingSeparators(parent);
	const separator = separatorOf(base);
	return base.endsWith(separator) ? `${base}${name}` : `${base}${separator}${name}`;
}

/** True when `path` is `root` itself or sits underneath it, either separator accepted. */
export function isUnder(root: string, path: string): boolean {
	if (root === "" || path === "") return false;
	const base = trimTrailingSeparators(normalizePath(root));
	const target = trimTrailingSeparators(normalizePath(path));
	if (target === base) return true;
	const prefix = base.endsWith("/") ? base : `${base}/`;
	return target.startsWith(prefix);
}

/**
 * `path` with `root`'s prefix removed, `/`-separated, or `null` when it is not under `root`.
 * The root itself is `""`, so callers can treat "no relative part" and "not inside" differently.
 */
export function relativeTo(root: string, path: string): string | null {
	if (!isUnder(root, path)) return null;
	const base = trimTrailingSeparators(normalizePath(root));
	const target = trimTrailingSeparators(normalizePath(path));
	if (target === base) return "";
	const prefix = base.endsWith("/") ? base : `${base}/`;
	return target.slice(prefix.length);
}

/** The meaningful segments of `path`, both separators accepted; `C:` stays a segment of its own. */
export function segments(path: string): string[] {
	return normalizePath(path)
		.split("/")
		.filter((part) => part !== "");
}

/** Both halves of a path, either separator accepted. */
export function splitPath(path: string): { dir: string; name: string } {
	const trimmed = trimTrailingSeparators(path);
	return { dir: parentDir(trimmed) ?? "", name: fileName(trimmed) };
}
