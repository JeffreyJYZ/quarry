/**
 * Session start: capabilities, launch, the breakpoint, and the wait for the stop that lands on the
 * marker line.
 *
 * `stopOnEntry` lands in dyld on arm64 (reason "exception"), so the stop is only accepted when the
 * top frame is this file's marker line; everything else is resumed and recorded.
 */

import type { Context, Json } from "./state";

const CAPABILITY_NAMES = [
	"supportsReadMemoryRequest",
	"supportsDisassembleRequest",
	"supportsDataBreakpoints",
	"supportsMemoryReferences",
	"supportsMemoryEvent",
	"supportsWriteMemoryRequest",
	"supportsSetVariable",
	"supportsConditionalBreakpoints",
	"supportsHitConditionalBreakpoints",
	"supportsLogPoints",
	"supportsEvaluateForHovers",
	"supportsRestartRequest",
	"supportsTerminateRequest",
];

export async function open(ctx: Context): Promise<Record<string, boolean>> {
	const caps = await ctx.client.send("initialize", {
		clientID: "quarry-dap-spike",
		clientName: "quarry dap spike",
		adapterID: "lldb",
		locale: "en-US",
		linesStartAt1: true,
		columnsStartAt1: true,
		pathFormat: "path",
		supportsVariableType: true,
		supportsVariablePaging: true,
		supportsMemoryReferences: true,
		supportsRunInTerminalRequest: false,
	});
	const capabilities: Record<string, boolean> = {};
	for (const name of CAPABILITY_NAMES) capabilities[name] = caps[name] === true;
	ctx.report.capabilities = capabilities;

	// lldb-dap answers launch after target creation (before configurationDone), so the target exists
	// by the time breakpoints land.
	await ctx.client.send("launch", {
		program: ctx.scratch.binary,
		args: [],
		cwd: ctx.scratch.dir,
		stopOnEntry: true,
		terminal: "console",
	});
	return capabilities;
}

export async function setBreakpoints(ctx: Context): Promise<void> {
	const result = await ctx.client.send("setBreakpoints", {
		source: { name: "main.rs", path: ctx.scratch.source },
		breakpoints: [{ line: ctx.scratch.breakpointLine }],
		sourceModified: false,
	});
	const breakpoints = (result.breakpoints as Array<Json> | undefined) ?? [];
	let verified = breakpoints.filter((b) => b.verified === true).length;
	if (verified < 1) {
		// A pending breakpoint is re-reported as a `breakpoint` event once resolved.
		const resolved = await ctx.client
			.waitForEvent((e) => e.event === "breakpoint", 5_000)
			.catch(() => null);
		if (resolved?.body?.breakpoint) {
			const bp = resolved.body.breakpoint as Json;
			if (bp.verified === true) verified = 1;
			ctx.report.breakpointEvent = {
				reason: resolved.body.reason ?? null,
				verified: bp.verified,
			};
		}
	}
	if (verified < 1) ctx.fail("setBreakpoints", `line ${ctx.scratch.breakpointLine} not verified`);
	ctx.report.breakpoint = { line: ctx.scratch.breakpointLine, verified };
}

export interface Stop {
	frames: Json[];
	threadId: number;
}

export async function waitForStop(ctx: Context): Promise<Stop> {
	const { client, scratch, report } = ctx;
	await client.send("configurationDone", {});

	let stopped = await client.waitForEvent((e) => e.event === "stopped");
	report.entryStopReason = String(stopped.body?.reason ?? "unknown");
	let threadId = Number(stopped.body?.threadId ?? 0);
	let frames: Array<Json> = [];
	const stopSummaries: string[] = [];
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 20 });
		frames = (stack.stackFrames as Array<Json> | undefined) ?? [];
		const top = frames[0];
		const topSource = String((top?.source as Json | undefined)?.path ?? "");
		stopSummaries.push(
			`${String(stopped.body?.reason ?? "?")}:${String(top?.name ?? "?")}@${String(top?.line ?? "?")}`,
		);
		if (Number(top?.line) === scratch.breakpointLine && topSource.endsWith("main.rs")) break;
		await client.send("continue", { threadId });
		stopped = await client.waitForEvent((e) => e.event === "stopped");
		threadId = Number(stopped.body?.threadId ?? threadId);
	}
	report.stopTrail = stopSummaries;
	report.stopReason = String(stopped.body?.reason ?? "unknown");
	report.allThreadsStopped = stopped.body?.allThreadsStopped === true;

	const threads = await client.send("threads", {});
	const threadList = (threads.threads as Array<Json> | undefined) ?? [];
	report.threads = threadList.map((t) => ({ id: t.id, name: t.name }));

	// biome-ignore lint/suspicious/noConfusingLabels: a labeled block gives an early exit across a long await section
	matchTopFrame: {
		const top = frames[0];
		if (!top) {
			ctx.fail("stackTrace", "no frames");
			break matchTopFrame;
		}
		report.topFrame = {
			name: top.name,
			line: top.line,
			source: (top.source as Json | undefined)?.path ?? null,
			instructionPointerReference: top.instructionPointerReference ?? null,
		};
		const atBreakpoint = Number(top.line) === scratch.breakpointLine;
		if (!atBreakpoint) {
			ctx.measure(
				"stopAtBreakpoint",
				false,
				`stopped at line ${String(top.line)} of ${String((top.source as Json | undefined)?.path)}, expected ${scratch.breakpointLine}`,
			);
		}
	}
	return { frames, threadId };
}
