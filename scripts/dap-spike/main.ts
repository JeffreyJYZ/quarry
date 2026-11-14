/**
 * The run: open a session, read the frame, then memory, disassembly and the watchpoint, then let the
 * program finish and report.
 *
 * Every reading goes into one `report` object, so `--json` and the human table are two renderings of
 * the same run rather than two code paths.
 */

import { spawnSync } from "node:child_process";
import { DapClient } from "./client";
import { finishRun } from "./finish";
import { probeRustFormatters } from "./formatters";
import { readDisassembly, readMemory } from "./memory";
import { printReport } from "./report";
import { makeScratch } from "./scratch";
import { openSession } from "./session";
import type { Context, Measure } from "./state";
import { armWatchpoint } from "./watch";

export async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const projectIndex = argv.indexOf("--project");
	const forcedDir = projectIndex >= 0 ? argv[projectIndex + 1] : undefined;
	const emitJson = argv.includes("--json");

	const measures: Measure[] = [];
	const measure = (name: string, ok: boolean, detail: string, required = true) => {
		measures.push({ name, required, ok, detail });
		return ok;
	};

	const versionProbe = spawnSync("xcrun", ["lldb-dap", "--version"], { encoding: "utf8" });
	const adapterPath = spawnSync("xcrun", ["--find", "lldb-dap"], {
		encoding: "utf8",
	}).stdout?.trim();
	if (!adapterPath) throw new Error("xcrun --find lldb-dap returned nothing");
	const llvmVersion = /LLVM version ([\d.]+)/.exec(versionProbe.stdout ?? "")?.[1] ?? "unknown";
	const liblldb = /liblldb: (lldb-[\d.a-z]+)/.exec(versionProbe.stdout ?? "")?.[1] ?? "unknown";

	const scratch = makeScratch(forcedDir);
	const report: Record<string, unknown> = {
		adapterPath,
		llvmVersion,
		liblldb,
		breakpointLine: scratch.breakpointLine,
	};

	const client = new DapClient(adapterPath);
	const fail = (name: string, detail: string) => {
		measure(name, false, detail, true);
	};
	const ctx: Context = { client, scratch, report, measure, fail };

	try {
		const session = await openSession(ctx);
		await readMemory(ctx, session);
		await readDisassembly(ctx, session);
		const threadId = await armWatchpoint(ctx, session);
		await finishRun(ctx, threadId);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		fail("dap", message);
	} finally {
		client.kill();
	}

	report.rustFormatters = await probeRustFormatters(adapterPath, scratch).catch((error) => ({
		error: error instanceof Error ? error.message : String(error),
	}));

	report.eventLog = client.eventLog;
	report.reverseRequests = client.reverseRequests;
	report.stderrTail = client.stderr().split("\n").slice(-6);

	const required = measures.filter((m) => m.required);
	const failed = required.filter((m) => !m.ok);

	if (emitJson) {
		console.log(JSON.stringify({ ...report, measures }, null, 2));
	} else {
		printReport(report, failed);
	}

	if (failed.length > 0) process.exit(1);
}
