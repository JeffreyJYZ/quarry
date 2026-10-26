import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const REPO_ROOT = join(import.meta.dir, "../../..");
const CAPABILITIES = "src-tauri/capabilities/default.json";
const STORE = "src/lib/updates/store.ts";

/** The updater commands the store actually calls, and the permission each one needs. */
const REQUIRED: ReadonlyArray<{ call: RegExp; permission: string }> = [
	{ call: /update\.download\(/, permission: "updater:allow-download" },
	{ call: /update\.install\(/, permission: "updater:allow-install" },
];

function readSource(relativePath: string): string {
	try {
		return readFileSync(join(REPO_ROOT, relativePath), "utf8");
	} catch (error) {
		throw new Error(`capability test cannot read ${relativePath}: ${String(error)}`);
	}
}

/**
 * Tauri refuses a plugin command the capability does not list, and only at runtime: the settings
 * page and the silent poll both look fine until a download starts.
 */
describe("updater capabilities", () => {
	test("every updater command the store calls is allowed", () => {
		const store = readSource(STORE);
		const permissions: string[] = JSON.parse(readSource(CAPABILITIES)).permissions;
		const called = REQUIRED.filter((entry) => entry.call.test(store));
		// A renamed API would otherwise silence this test instead of failing it.
		expect(called.length).toBe(REQUIRED.length);
		const missing = called
			.map((entry) => entry.permission)
			.filter((p) => !permissions.includes(p));
		expect(missing).toEqual([]);
	});

	test("restart needs the process permission", () => {
		const permissions: string[] = JSON.parse(readSource(CAPABILITIES)).permissions;
		expect(permissions).toContain("process:allow-restart");
	});
});
