#!/usr/bin/env bun
/**
 * The record of what a row asserted, and what it prints when one of them failed.
 *
 * Each assertion is printed as it is decided and keeps the window of the conversation it was judged
 * on, so the failure block can quote the exact request and response — a Windows runner cannot be
 * replayed by hand, so the log is the only evidence there is. Evidence that does not decide the run
 * goes through [`Checks::note`] and never fails it.
 */

import type { DapClient } from "./windows-debug-dap-client";

/** One assertion's verdict, and the window of the conversation it is judged on. */
export interface Check {
	label: string;
	ok: boolean;
	detail: string;
	from: number;
	to: number;
}

/** Every assertion the row made, printed as it is decided. */
export class Checks {
	private readonly items: Check[] = [];

	add(label: string, ok: boolean, detail: string, from: number, to: number): void {
		this.items.push({ label, ok, detail, from, to });
		const suffix = ok || detail === "" ? "" : `: ${detail}`;
		console.log(`parity-windows-debug  ${ok ? "PASS" : "FAIL"}  ${label}${suffix}`);
	}

	/**
	 * One measurement that is evidence rather than a requirement.
	 *
	 * A row that only ever prints verdicts hides what it saw; this prints a fact without deciding the
	 * run, which is what an adapter's behaviour beyond the product's own call is.
	 */
	note(label: string, detail: string): void {
		console.log(`parity-windows-debug  note  ${label}${detail === "" ? "" : `: ${detail}`}`);
	}

	get hadFailure(): boolean {
		return this.items.some((item) => !item.ok);
	}

	get count(): number {
		return this.items.length;
	}

	/** The exact request/response pair behind every failure, then whatever the adapter said. */
	failures(client: DapClient): string[] {
		const failures = this.items.filter((entry) => !entry.ok);
		if (failures.length === 0) return [];
		const lines: string[] = [];
		for (const item of failures) {
			lines.push(`--- ${item.label} (${item.detail}) ---`);
			lines.push(...client.report(item.from, item.to));
		}
		const stderr = client.stderrLines().filter((line) => line.trim() !== "");
		if (stderr.length > 0) lines.push("--- lldb-dap stderr ---", ...stderr);
		return lines;
	}
}
