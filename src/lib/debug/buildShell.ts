/**
 * The shell a build command line runs through, chosen per platform.
 *
 * A preset's `build` field is a shell line — `cargo build`, `cmake --build build`, `make -j8 && cp …`
 * — so it is not a program plus arguments and needs a real shell. Windows has only `cmd.exe`,
 * macOS ships `/bin/zsh`, and Linux is not guaranteed to have zsh at all: `/bin/sh` is the one POSIX
 * shell every install carries, and it is the fallback there.
 */

export type ShellPlatform = "windows" | "macos" | "linux";

/** The desktop environment, when the caller can read it: `$SHELL` and whether a path is real. */
export type ShellLookup = {
	loginShell?: string | null;
	exists?: (path: string) => boolean;
};

export const WINDOWS_SHELL = "C:\\Windows\\System32\\cmd.exe";
export const MACOS_SHELL = "/bin/zsh";
export const LINUX_SHELL = "/bin/sh";

/** The platform a webview user agent names; macOS is the remaining case, so it is the default. */
export function shellPlatform(userAgent: string): ShellPlatform {
	if (userAgent.includes("Windows")) return "windows";
	if (userAgent.includes("Linux") || userAgent.includes("X11")) return "linux";
	return "macos";
}

/**
 * The shell for `platform`; on Linux the user's own `$SHELL` wins when it is absolute and exists.
 *
 * `lookup` is what the caller knows about the desktop, and a webview knows nothing: with no
 * `loginShell` Linux takes `/bin/sh`, which is the point — a missing `/bin/zsh` used to fail the
 * spawn before the build ever ran.
 */
export function buildShell(platform: ShellPlatform, lookup: ShellLookup = {}): string {
	if (platform === "windows") return WINDOWS_SHELL;
	if (platform === "macos") return MACOS_SHELL;
	const shell = lookup.loginShell?.trim() ?? "";
	if (shell.startsWith("/") && lookup.exists?.(shell) === true) return shell;
	return LINUX_SHELL;
}

/** The flags that run one command line in that shell: `cmd /C`, or a POSIX login shell's `-lc`. */
export function buildShellArgs(platform: ShellPlatform, command: string): string[] {
	return platform === "windows" ? ["/C", command] : ["-lc", command];
}
