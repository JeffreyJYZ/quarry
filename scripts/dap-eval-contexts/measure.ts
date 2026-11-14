/**
 * One measurement pass per target, shaped so the only variable is the request.
 *
 * `measureOrder` uses a fresh session for the FIRST request, because a refusal there cannot be
 * state drift left by an earlier call; `measure` then walks every context and the omitted case.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: DAP payloads are untyped JSON
import { DapClient, type Json } from "./client";
import type { Outcome, Target } from "./targets";

/** The context `dap_evaluate` sends when the UI passes none. Change with `docs/spikes/evaluate.md`. */
export const DEFAULT_CONTEXT = "watch";
export const CONTEXTS = ["repl", "watch", "variables", "hover", "clipboard"] as const;

/** Stop on `target.line` and return the adapter, top frame id and thread id. */
async function stopOn(target: Target): Promise<{
	client: DapClient;
	frameId: number;
	threadId: number;
}> {
	const adapter =
		Bun.which("lldb-dap") ?? "/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap";
	const child = Bun.spawn([adapter], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
	const client = new DapClient(child);
	await client.send("initialize", {
		adapterID: "lldb",
		clientID: "quarry-eval-contexts",
		pathFormat: "path",
		linesStartAt1: true,
		supportsVariableType: true,
	});
	const before = client.seen;
	await client.send("launch", {
		program: target.program,
		args: [],
		cwd: target.cwd,
		stopOnEntry: false,
		terminal: "console",
		initCommands: target.initCommands,
	});
	await client.event("initialized", before);
	await client.send("setBreakpoints", {
		source: { name: target.source.split("/").pop() ?? "", path: target.source },
		breakpoints: [{ line: target.line }],
		sourceModified: false,
	});
	await client.send("configurationDone", {});
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const stopped = await client.event("stopped", before);
		const threadId = Number((stopped.body as Json | undefined)?.threadId ?? 0);
		const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 2 });
		const frames = (stack.stackFrames as Json[] | undefined) ?? [];
		const top = frames[0];
		const path = String((top?.source as Json | undefined)?.path ?? "");
		if (Number(top?.line) === target.line && path === target.source) {
			return { client, frameId: Number(top?.id ?? 0), threadId };
		}
		await client.send("continue", { threadId });
	}
	throw new Error(`${target.label}: never stopped on ${target.source}:${target.line}`);
}

/** One `evaluate`, shaped exactly as `dap_evaluate` sends it (frame id included). */
async function attempt(
	client: DapClient,
	frameId: number | null,
	expression: string,
	context: string | null,
): Promise<{ value: string | null; type: string | null; message: string | null }> {
	try {
		const args: Json = { expression };
		if (frameId !== null) args.frameId = frameId;
		if (context !== null) args.context = context;
		const body = await client.send("evaluate", args);
		const value = String(body.result ?? "");
		const type = body.type === undefined ? null : String(body.type);
		return { value, type, message: null };
	} catch (error) {
		return {
			value: null,
			type: null,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * A fresh session per target, so the shape of the first request is the only variable: it omits
 * `frameId` while the process is stopped, then the same session asks again with it. That is what
 * separates "the adapter needs a frame id" from "an earlier call left the process running".
 */
export async function measureOrder(target: Target, outcomes: Outcome[]): Promise<void> {
	const { client, frameId } = await stopOn(target);
	const first = target.expressions[0];
	const refused = await attempt(client, null, first.expression, DEFAULT_CONTEXT);
	outcomes.push({
		language: target.label,
		context: "no-frame-first",
		expression: first.expression,
		...refused,
	});
	const recovered = await attempt(client, frameId, first.expression, DEFAULT_CONTEXT);
	outcomes.push({
		language: target.label,
		context: "frame-after-refusal",
		expression: first.expression,
		...recovered,
	});
	for (const expression of target.syntax ?? []) {
		const outcome = await attempt(client, frameId, expression, DEFAULT_CONTEXT);
		outcomes.push({ language: target.label, context: "syntax", expression, ...outcome });
	}
	await client.stop();
}

export async function measure(target: Target, outcomes: Outcome[]): Promise<void> {
	const { client, frameId } = await stopOn(target);
	const language = target.label;
	for (const context of [...CONTEXTS, "omitted"]) {
		const sent = context === "omitted" ? null : context;
		for (const { expression } of target.expressions) {
			const outcome = await attempt(client, frameId, expression, sent);
			outcomes.push({ language, context, expression, ...outcome });
		}
	}
	// The 2026-10-22 verdict of record came from requests that carried no `frameId`; keep measuring
	// that shape so the doc can say which half of the request the difference came from.
	for (const { expression } of target.expressions) {
		const outcome = await attempt(client, null, expression, DEFAULT_CONTEXT);
		outcomes.push({ language, context: "no-frame-id", expression, ...outcome });
	}
	await client.stop();
}
