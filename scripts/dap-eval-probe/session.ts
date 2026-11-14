/**
 * Getting one session stopped on the marker line, with the locals scope's handle.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: DAP payloads are untyped JSON
import { DapClient } from "./client";
import type { Scratch } from "./scratch";

export interface Session {
	client: DapClient;
	frameId: number;
	localsRef: number;
	threadId: number;
	pointerAddr: string;
	rawValue: string;
}

export async function setupSession(
	adapterPath: string,
	scratch: Scratch,
	initCommands: string[],
): Promise<Session> {
	const client = new DapClient(adapterPath);
	await client.send("initialize", {
		clientID: "quarry-dap-eval",
		clientName: "quarry dap eval",
		adapterID: "lldb",
		linesStartAt1: true,
		pathFormat: "path",
		supportsVariableType: true,
		supportsMemoryReferences: true,
	});
	await client.send("launch", {
		program: scratch.binary,
		args: [],
		cwd: scratch.dir,
		stopOnEntry: true,
		terminal: "console",
		initCommands,
	});
	await client.send("setBreakpoints", {
		source: { name: "main.rs", path: scratch.source },
		breakpoints: [{ line: scratch.breakpointLine }],
		sourceModified: false,
	});
	await client.send("configurationDone", {});
	let stopped = await client.waitForEvent((e: any) => e.event === "stopped");
	let threadId = Number(stopped.body?.threadId ?? 0);
	let frames: any[] = [];
	for (let i = 0; i < 8; i++) {
		const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 5 });
		frames = (stack.stackFrames as any[]) ?? [];
		const top = frames[0];
		const topSource = String((top?.source as any)?.path ?? "");
		if (Number(top?.line) === scratch.breakpointLine && topSource.endsWith("main.rs")) break;
		await client.send("continue", { threadId });
		stopped = await client.waitForEvent((e: any) => e.event === "stopped");
		threadId = Number(stopped.body?.threadId ?? threadId);
	}
	const frameId = Number(frames[0]?.id ?? 0);
	const scopesResult = await client.send("scopes", { frameId });
	const scopes = (scopesResult.scopes as any[]) ?? [];
	const localsScope =
		scopes.find((s: any) => s.presentationHint === "locals") ??
		scopes.find((s: any) => /local/i.test(String(s.name))) ??
		scopes[0];
	const localsRef = Number(localsScope.variablesReference);
	return { client, frameId, localsRef, threadId, pointerAddr: "", rawValue: "" };
}

export function shortErr(e: unknown): string {
	return (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 240);
}
