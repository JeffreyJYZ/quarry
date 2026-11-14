/**
 * The measurements, grouped by what they ask: variables and memory on the stopped process, then
 * every `evaluate` shape the dock could send.
 *
 * They run on the FIRST stop on purpose: a refusal here cannot be state drift left by an earlier
 * request, which is exactly the ambiguity this probe exists to remove.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: DAP payloads are untyped JSON
import type { DapClient } from "./client";
import type { Scratch } from "./scratch";
import { KNOWN_BYTES } from "./scratch";
import { type Session, setupSession, shortErr } from "./session";

export type Record = (variant: string, result: string) => void;

/** What the process exposes through `variables`, before anything has been asked of it. */
export async function readPointer(session: Session): Promise<void> {
	const vars0 = await session.client.send("variables", {
		variablesReference: session.localsRef,
	});
	const locals0 = (vars0.variables as any[]) ?? [];
	const rawVar = locals0.find((v: any) => v.name === "raw");
	const rawValue = String(rawVar?.value ?? "");
	const m = /^0x[0-9a-f]+/i.exec(rawValue.trim());
	session.pointerAddr = m?.[0] ?? "";
	session.rawValue = rawValue;
}

/** The request shapes that are not `evaluate`: variables, memory, and the known crash. */
export async function escapeHatches(session: Session, record: Record): Promise<void> {
	try {
		const def = await session.client.send("variables", {
			variablesReference: session.localsRef,
		});
		const named = await session.client.send("variables", {
			variablesReference: session.localsRef,
			filter: "named",
		});
		record(
			"(i) variables default",
			`OK count=${(def.variables as any[]).length} names=${(def.variables as any[]).map((v: any) => v.name).join(",")}`,
		);
		record(
			"(i) variables filter=named",
			`OK count=${(named.variables as any[]).length} names=${(named.variables as any[]).map((v: any) => v.name).join(",")}`,
		);
	} catch (e) {
		record("(i) variables filter", `FAIL ${shortErr(e)}`);
	}

	record("(ii) setExpression", "SKIPPED - crashes lldb-dap here (measured: adapter exited)");

	try {
		if (!session.pointerAddr) throw new Error("no raw pointer address");
		const mem = await session.client.send("readMemory", {
			memoryReference: session.pointerAddr,
			count: KNOWN_BYTES.length,
			offset: 0,
		});
		const bytes = Array.from(Buffer.from(String(mem.data ?? ""), "base64"));
		const ok =
			bytes.length === KNOWN_BYTES.length && bytes.every((b, i) => b === KNOWN_BYTES[i]);
		record(
			"(iii) readMemory via raw ptr",
			`${ok ? "OK" : "MISMATCH"} ${bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
		);
	} catch (e) {
		record("(iii) readMemory via raw ptr", `FAIL ${shortErr(e)}`);
	}
}

/** Every `evaluate` the dock could send, with and without the stopped frame's id. */
export async function evaluateVariants(session: Session, record: Record): Promise<void> {
	const variants: Array<{ label: string; expression: string; context: string; frame?: boolean }> =
		[
			{ label: "(a) repl, n", expression: "n", context: "repl" },
			{ label: "(b) watch, *raw@8", expression: "*raw@8", context: "watch" },
			{ label: "(c) hover, n", expression: "n", context: "hover" },
			{ label: "(e) repl, n, frameId", expression: "n", context: "repl", frame: true },
			{ label: "(f) expressions/repl", expression: "n", context: "repl" },
			{ label: "(f) expressions/watch", expression: "n", context: "watch" },
		];
	for (const variant of variants) {
		try {
			const r = await session.client.send("evaluate", {
				expression: variant.expression,
				context: variant.context,
				...(variant.frame === true ? { frameId: session.frameId } : {}),
			});
			record(variant.label, `OK ${String(r.result ?? "")}`);
		} catch (e) {
			record(variant.label, `FAIL ${shortErr(e)}`);
		}
	}
}

/** The second session, with lldb told the target is Rust. */
export async function rustLanguageSession(
	adapterPath: string,
	scratch: Scratch,
	initCommands: string[],
	record: Record,
): Promise<DapClient> {
	const session = await setupSession(adapterPath, scratch, initCommands);
	for (const [label, expr, ctx] of [
		["(d) repl, n", "n", "repl"],
		["(d) watch, *raw@8", "*raw@8", "watch"],
		["(d) hover, n", "n", "hover"],
	] as const) {
		try {
			const r = await session.client.send("evaluate", { expression: expr, context: ctx });
			record(label, `OK ${String(r.result ?? "")}`);
		} catch (e) {
			record(label, `FAIL ${shortErr(e)}`);
		}
	}
	return session.client;
}
