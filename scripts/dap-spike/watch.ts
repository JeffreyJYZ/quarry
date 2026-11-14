/**
 * The watchpoint: what the adapter will watch, whether it fires, and whether the value it hit on is
 * the one that was watched.
 *
 * A stack slot is reused by later frames, so the static is preferred when the adapter offers one: its
 * address stays valid and its write is attributable.
 */

import type { Context, Json, Session } from "./state";

/** Arms the watchpoint and resumes; returns the thread id the run is on afterwards. */
export async function armWatchpoint(ctx: Context, session: Session): Promise<number> {
	const { client, report, fail } = ctx;
	let threadId = session.threadId;
	const { localsRef, locals, scopes, counter } = session;

	const watchName = counter ? "n" : String(locals[0]?.name ?? "");
	const info = await client.send("dataBreakpointInfo", {
		variablesReference: localsRef,
		name: watchName,
	});
	const dataId = typeof info.dataId === "string" ? info.dataId : null;
	report.dataBreakpoint = {
		name: watchName,
		dataId,
		description: info.description ?? null,
		accessTypes: info.accessTypes ?? null,
		canPersist: info.canPersist ?? null,
	};
	if (session.capabilities.supportsDataBreakpoints && !dataId) {
		fail("dataBreakpointInfo", `no dataId for ${watchName}`);
	}

	let counterInfo: Json | null = null;
	const globalsScope = scopes.find((s) => /global/i.test(String(s.name)));
	if (globalsScope) {
		const globalsResult = await client.send("variables", {
			variablesReference: Number(globalsScope.variablesReference),
		});
		const globals = (globalsResult.variables as Array<Json> | undefined) ?? [];
		const counterVar = globals.find((g) => /COUNTER/.test(String(g.name)));
		if (counterVar) {
			const counterName = String(counterVar.name);
			counterInfo = await client.send("dataBreakpointInfo", {
				variablesReference: Number(globalsScope.variablesReference),
				name: counterName,
			});
			report.staticDataBreakpoint = {
				name: counterName,
				dataId: counterInfo.dataId ?? null,
				description: counterInfo.description ?? null,
				accessTypes: counterInfo.accessTypes ?? null,
			};
		}
	}

	const watchDataId =
		typeof counterInfo?.dataId === "string" ? String(counterInfo.dataId) : dataId;
	if (!watchDataId) return threadId;

	const setResult = await client.send("setDataBreakpoints", {
		breakpoints: [{ dataId: watchDataId, accessType: "write" }],
	});
	report.setDataBreakpoints = setResult.breakpoints ?? null;

	// Remove the line breakpoint so the only armed stop is the watchpoint, which makes the resulting
	// frame attributable to the watched write.
	await client.send("setBreakpoints", {
		source: { name: "main.rs", path: ctx.scratch.source },
		breakpoints: [],
	});
	await client.send("continue", { threadId });
	const outcome = await client
		.waitForEvent((e) => e.event === "stopped" || e.event === "terminated", 10_000)
		.catch(() => null);
	report.dataBreakpointOutcome = outcome
		? {
				event: outcome.event,
				reason: outcome.body?.reason ?? null,
				hitBreakpointIds: outcome.body?.hitBreakpointIds ?? null,
				description: outcome.body?.description ?? null,
			}
		: { event: "none", reason: null };
	if (outcome?.event !== "stopped") return threadId;

	threadId = Number(outcome.body?.threadId ?? threadId);
	const hitStack = await client.send("stackTrace", {
		threadId,
		startFrame: 0,
		levels: 5,
	});
	const hitTop = ((hitStack.stackFrames as Array<Json> | undefined) ?? [])[0];
	report.dataBreakpointStop = {
		name: hitTop?.name ?? null,
		line: hitTop?.line ?? null,
		source: (hitTop?.source as Json | undefined)?.path ?? null,
	};
	// Decisive check: re-read the watched static. It advances 8 -> 16 when the second call writes it,
	// so a value of 16 proves the watchpoint targeted it.
	const staticId = typeof counterInfo?.dataId === "string" ? String(counterInfo.dataId) : "";
	const staticAddress = /^([0-9a-f]+)\/(\d+)$/i.exec(staticId);
	if (staticAddress) {
		const word = await client.send("readMemory", {
			memoryReference: `0x${staticAddress[1]}`,
			count: Number(staticAddress[2]),
		});
		const bytes = Array.from(Buffer.from(String(word.data ?? ""), "base64"));
		report.counterAtWatchStop = bytes.reduce(
			(acc, byte, index) => acc + byte * 256 ** index,
			0,
		);
	}
	return threadId;
}
