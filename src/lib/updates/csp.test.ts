import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchReleaseNotes } from "@/lib/updates/notes";

const REPO_ROOT = join(import.meta.dir, "../../..");
const CONFIG = "src-tauri/tauri.conf.json";

type Config = {
	app?: { security?: { csp?: string | null } };
	version?: string;
};

function config(): Config {
	try {
		return JSON.parse(readFileSync(join(REPO_ROOT, CONFIG), "utf8")) as Config;
	} catch (error) {
		throw new Error(`${CONFIG} cannot be read: ${String(error)}`);
	}
}

function connectSources(csp: string): string[] {
	const directive = /(?:^|;)\s*connect-src([^;]*)/.exec(csp)?.[1] ?? "";
	return directive.trim().split(/\s+/).filter(Boolean);
}

/**
 * The origin comes from the URL the module actually builds, not from a literal kept in this test:
 * a change to the notes endpoint must fail here until the shipped policy allows the new origin.
 */
async function notesOrigin(version: string): Promise<string> {
	let requested = "";
	await fetchReleaseNotes(version, (url) => {
		requested = url;
		return Promise.resolve({ ok: true, json: async () => ({ body: "- one" }) });
	});
	expect(requested).not.toBe("");
	return new URL(requested).origin;
}

const shipped = config();
const sources = connectSources(shipped.app?.security?.csp ?? "");

describe("release notes against the shipped CSP", () => {
	test("the webview may request the origin the notes URL uses", async () => {
		const origin = await notesOrigin(shipped.version ?? "");
		expect(sources).toContain(origin);
	});

	test("opening that origin did not open up all of https", async () => {
		const origin = await notesOrigin(shipped.version ?? "");
		const remote = sources.filter((source) => source.startsWith("https:"));
		expect(remote).toEqual([origin]);
	});
});
