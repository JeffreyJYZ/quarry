/**
 * The directory a run starts in, and what makes a typed one usable.
 *
 * The cwd field is optional: a program almost always runs in the project it belongs to, and a
 * configuration saved before the run form was prefilled carries an empty cwd. Refusing that at Run
 * time turned a saved configuration into an error the panel never showed, so an empty field means
 * the project root. Anything the user did type is kept verbatim, including a relative path, which
 * the caller still rejects with a message naming the field.
 */
export function runCwd(cwd: string, root: string): string {
	return cwd.trim() === "" ? root : cwd;
}

/**
 * Whether a path is absolute on this platform: a leading slash on POSIX, or a Windows drive letter
 * followed by either separator. The backend checks with `Path::is_absolute`, so a drive-letter path
 * must pass here or a Windows build would refuse every run before the command is even invoked.
 */
export function isAbsoluteRunPath(path: string): boolean {
	return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}
