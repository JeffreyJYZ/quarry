/**
 * The human report: one line per measured thing, then the verdict naming every required step that
 * failed.
 *
 * `--json` prints the same readings as data instead, which is what `docs/spikes/dap.md` quotes.
 */

import type { Json, Measure } from "./state";

export function printReport(report: Record<string, unknown>, failed: Measure[]): void {
	const caps = report.capabilities as Record<string, boolean>;
	const yn = (v: boolean | undefined) => (v ? "yes" : "no");
	const renderings = report.renderings as Record<string, string | null> | undefined;
	const disasm = report.disassembly as
		Array<{ address: string; instruction: string }> | undefined;
	const dataBp = report.dataBreakpoint as { name: string; dataId: string | null } | undefined;
	const topFrame = report.topFrame as { name: string; line: number } | undefined;
	const lines: string[] = [];
	lines.push("DAP spike — lldb-dap");
	lines.push(`  adapter     ${String(report.adapterPath)}`);
	lines.push(`  version     LLVM ${String(report.llvmVersion)} · ${String(report.liblldb)}`);
	lines.push(
		`  caps        readMemory=${yn(caps.supportsReadMemoryRequest)} disassemble=${yn(caps.supportsDisassembleRequest)} dataBreakpoints=${yn(caps.supportsDataBreakpoints)} memoryRefs=${yn(caps.supportsMemoryReferences)} memoryEvent=${yn(caps.supportsMemoryEvent)}`,
	);
	lines.push(
		`  breakpoint  main.rs:${String(report.breakpointLine)} verified=${String((report.breakpoint as { verified: number }).verified)} stoppedIn=${topFrame?.name ?? "?"}@${String(topFrame?.line)}`,
	);
	lines.push(`  vec         ${renderings?.vec ?? "(absent)"}`);
	lines.push(
		`              children: ${((report.vecChildren as Array<{ name: string; value: string }> | undefined) ?? []).map((c) => `${c.name}=${c.value}`).join(" · ") || "(none)"}`,
	);
	lines.push(
		`  string      ${renderings?.string ?? "(absent)"} · children: ${((report.stringChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",") || "(none)"}`,
	);
	lines.push(
		`  option      ${renderings?.option ?? "(absent)"} · children: ${((report.optionChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",") || "(none)"}`,
	);
	lines.push(
		`  pointer     ${(renderings?.pointer ?? "(absent)").replace(/\s+"[\s\S]*$/, ' "…"')}`,
	);
	lines.push(
		`  readMemory  ${String(report.readMemoryAddress ?? "?")} = ${String(report.readMemoryHex ?? "?")}`,
	);
	lines.push(
		`  disasm      ${disasm?.[0] ? `${disasm[0].address} ${disasm[0].instruction}` : "(none)"}`,
	);
	lines.push(
		`              ${disasm?.[1] ? `${disasm[1].address} ${disasm[1].instruction}` : "(none)"}`,
	);
	const setBp = (report.setDataBreakpoints as Array<{ verified?: boolean }> | undefined) ?? [];
	const outcome = report.dataBreakpointOutcome as
		{ event?: string; reason?: string | null; description?: string | null } | undefined;
	const stopAt = report.dataBreakpointStop as { name?: string; line?: number } | undefined;
	const staticBp = report.staticDataBreakpoint as
		{ name: string; dataId: string | null } | undefined;
	lines.push(
		`  dataBP      local ${dataBp?.name}=${dataBp?.dataId ?? "no dataId"} · static ${staticBp ? `${staticBp.name}=${staticBp.dataId ?? "no dataId"}` : "n/a"} · set=${setBp.length ? `verified=${yn(setBp[0].verified)}` : "none"}`,
	);
	lines.push(
		`              fired=${outcome?.event === "stopped" ? `${stopAt?.name ?? "?"}@${String(stopAt?.line ?? "?")} (${String(outcome.description ?? outcome.reason ?? "")}, watched=${String(report.counterAtWatchStop ?? "?")})` : String(outcome?.event ?? "n/a")} · exit=${String((report.finish as { event?: string })?.event ?? "?")}`,
	);
	const pretty = report.pretty as
		{ vec: boolean; string: boolean; optionShowsSome: boolean } | undefined;
	lines.push(
		`  pretty      vec=${yn(pretty?.vec)} string=${yn(pretty?.string)} option=${pretty?.optionShowsSome ? "Some" : "raw"} · stock children v=[${((report.vecChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}] s=[${((report.stringChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}]`,
	);
	const fmt = report.rustFormatters as Json | undefined;
	if (fmt && !fmt.error) {
		lines.push(
			`  rust-lldb   vec=${String(fmt.vec ?? "?")} · children=[${((fmt.vecChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}]`,
		);
		lines.push(
			`              string=${String(fmt.string ?? "?")} · children=[${((fmt.stringChildren as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(",")}]`,
		);
	} else {
		lines.push(`  rust-lldb   unverified: ${String(fmt?.error ?? "probe did not run")}`);
	}
	const failedNames = failed.map((m) => m.name).join(", ");
	lines.push(`  verdict     ${failed.length === 0 ? "PASS" : `FAIL (${failedNames})`}`);
	if (report.stderrTail && (report.stderrTail as string[]).length > 0) {
		const tail = (report.stderrTail as string[]).filter(Boolean).slice(-2);
		if (tail.length > 0) lines.push(`  stderr      ${tail.join(" | ").slice(0, 300)}`);
	}
	console.log(lines.join("\n"));
}
