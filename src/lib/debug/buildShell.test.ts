import { describe, expect, test } from "bun:test";
import {
	buildShell,
	buildShellArgs,
	LINUX_SHELL,
	MACOS_SHELL,
	shellPlatform,
	WINDOWS_SHELL,
} from "@/lib/debug/buildShell";

/** A lookup that knows one shell exists and nothing else. */
function knowing(shell: string) {
	return { loginShell: shell, exists: (path: string) => path === shell };
}

describe("the shell a build line runs through", () => {
	test("windows keeps cmd.exe, whatever the environment says", () => {
		expect(buildShell("windows", knowing("/bin/bash"))).toBe(WINDOWS_SHELL);
		expect(buildShell("windows")).toBe(WINDOWS_SHELL);
		expect(buildShellArgs("windows", "make")).toEqual(["/C", "make"]);
	});

	test("macos keeps /bin/zsh", () => {
		expect(buildShell("macos", knowing("/opt/homebrew/bin/fish"))).toBe(MACOS_SHELL);
		expect(buildShellArgs("macos", "make")).toEqual(["-lc", "make"]);
	});

	test("linux without SHELL takes /bin/sh, which every install has", () => {
		expect(buildShell("linux")).toBe(LINUX_SHELL);
		expect(buildShell("linux", { loginShell: null })).toBe(LINUX_SHELL);
		expect(buildShell("linux", { loginShell: "  " })).toBe(LINUX_SHELL);
		expect(buildShellArgs("linux", "make")).toEqual(["-lc", "make"]);
	});

	test("linux keeps an absolute SHELL that exists", () => {
		expect(buildShell("linux", knowing("/usr/bin/fish"))).toBe("/usr/bin/fish");
	});

	test("linux ignores a SHELL that is not absolute or does not exist", () => {
		expect(buildShell("linux", knowing("fish"))).toBe(LINUX_SHELL);
		expect(buildShell("linux", { loginShell: "/usr/bin/fish" })).toBe(LINUX_SHELL);
		expect(buildShell("linux", { loginShell: "/usr/bin/fish", exists: () => false })).toBe(
			LINUX_SHELL,
		);
	});
});

describe("the platform a user agent names", () => {
	test("windows, linux and macos are told apart", () => {
		expect(shellPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
		expect(shellPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
		expect(shellPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("linux");
		expect(shellPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
	});
});
