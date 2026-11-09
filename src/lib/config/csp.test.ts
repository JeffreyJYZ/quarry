import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The webview's own content security policy.
 *
 * `csp: null` means there is none: any markup that reaches the document — a markdown preview, a
 * diagnostic message, a file name — could then load remote script. This is a config file, so nothing
 * else in the tree would notice it going back to null.
 */
function policy(): string {
	const file = join(import.meta.dir, "../../../src-tauri/tauri.conf.json");
	const config = JSON.parse(readFileSync(file, "utf8")) as {
		app?: { security?: { csp?: string | null } };
	};
	return config.app?.security?.csp ?? "";
}

describe("the app's content security policy", () => {
	test("is set", () => {
		expect(policy().trim()).not.toBe("");
	});

	test("scripts come from the bundle and nowhere else", () => {
		const script = /script-src([^;]*)/.exec(policy())?.[1] ?? "";
		expect(script).toContain("'self'");
		expect(script).not.toContain("'unsafe-eval'");
		expect(script).not.toContain("'unsafe-inline'");
	});

	test("there is a default source, so anything unlisted is refused", () => {
		expect(policy()).toContain("default-src 'self'");
	});

	test("the IPC channel is reachable", () => {
		expect(policy()).toMatch(/connect-src[^;]*ipc:/);
	});
});
