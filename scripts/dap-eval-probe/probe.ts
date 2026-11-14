/**
 * What the dock's Evaluate field can actually send on this machine: the two sessions, the recorded
 * answers, and the summary that names each variant.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
	escapeHatches,
	evaluateVariants,
	type Record,
	readPointer,
	rustLanguageSession,
} from "./evaluate";
import { makeScratch, sysroot } from "./scratch";
import { setupSession } from "./session";

export async function runProbe(): Promise<void> {
	const adapterPath = spawnSync("xcrun", ["--find", "lldb-dap"], {
		encoding: "utf8",
	}).stdout?.trim();
	if (!adapterPath) throw new Error("no adapter");
	const scratch = makeScratch();
	const sr = sysroot();
	const lookup = join(sr, "lib", "rustlib", "etc", "lldb_lookup.py");
	const baseInit = [`command script import ${lookup}`];
	const results: Array<{ variant: string; result: string }> = [];
	const record: Record = (variant, result) => {
		results.push({ variant, result });
		console.log(`${variant}: ${result}`);
	};

	const session = await setupSession(adapterPath, scratch, baseInit);
	await readPointer(session);
	// Escape hatches first, while the process is still stopped.
	await escapeHatches(session, record);
	await evaluateVariants(session, record);

	try {
		await session.client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
	} catch {}
	session.client.kill();

	const second = await rustLanguageSession(
		adapterPath,
		scratch,
		[...baseInit, "settings set target.language rust"],
		record,
	);
	try {
		await second.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
	} catch {}
	second.kill();

	console.log("\n--- SUMMARY ---");
	for (const r of results) console.log(`${r.variant} => ${r.result}`);
}
