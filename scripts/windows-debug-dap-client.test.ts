#!/usr/bin/env bun
/**
 * The one thing the first Windows session proved: an adapter can end before it answers.
 *
 * `--version` answered through `cmd /c`, and then the session died with `The network path was not
 * found.` — so the row has to tell "the adapter refused to start" from "the session broke", because
 * only the second is quarry's to fix. This pins the first: a child that exits before the answer
 * raises `AdapterGone` carrying its status and its own words.
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DapClient } from "./windows-debug-dap-client";
import { AdapterGone } from "./windows-debug-dap-errors";
import { initializeSession } from "./windows-debug-dap-session";

/** A stand-in adapter that says one thing and exits, the way the image's `lldb-dap` behaved. */
function deadAdapter(said: string, code: number): string {
	const root = mkdtempSync(join(tmpdir(), "quarry-dead-adapter-"));
	const path = join(root, "lldb-dap");
	writeFileSync(path, `#!/bin/sh\necho "${said}" >&2\nexit ${code}\n`);
	chmodSync(path, 0o755);
	return path;
}

describe("an adapter that ends before answering", () => {
	const posix = process.platform !== "win32";

	test.skipIf(!posix)("raises AdapterGone with its status and its own words", async () => {
		const client = new DapClient(deadAdapter("The network path was not found.", 1), tmpdir());
		try {
			await initializeSession(client);
			throw new Error("the session started without an adapter");
		} catch (error) {
			expect(error).toBeInstanceOf(AdapterGone);
			const gone = error as AdapterGone;
			expect(gone.exit).toBe(1);
			expect(gone.said).toContain("The network path was not found.");
			expect(gone.message).toContain("initialize was never answered");
		} finally {
			await client.stop();
		}
	});

	test.skipIf(!posix)("a silent death says it printed nothing", async () => {
		const client = new DapClient(deadAdapter("", 53), tmpdir());
		try {
			await initializeSession(client);
		} catch (error) {
			expect((error as AdapterGone).said).toBe("");
			expect((error as AdapterGone).message).toContain("it printed nothing");
		} finally {
			await client.stop();
		}
	});
});
