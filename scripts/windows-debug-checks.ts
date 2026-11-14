#!/usr/bin/env bun
/**
 * The record of what a row asserted, and what it prints when one of them failed.
 *
 * Each assertion is printed as it is decided and keeps the window of the conversation it was judged
 * on, so the failure block can quote the exact request and response. The block also carries how the
 * adapter was spawned and how it ended: a startup death has no exchange to quote, and those two
 * facts are then the whole evidence. Evidence that decides nothing goes through [`Checks.note`].
 */

import type { SessionTrace } from "./windows-debug-dap-report";
import { stderrBlock, report, contextBlock } from "./windows-debug-dap-report";

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

	/** The exact request/response pair behind every failure, then the process and its words. */
	failures(trace: SessionTrace): string[] {
		const failures = this.items.filter((entry) => !entry.ok);
		if (failures.length === 0) return [];
		const lines: string[] = [];
		for (const item of failures) {
			lines.push(`--- ${item.label} (${item.detail}) ---`);
			lines.push(...report(trace, item.from, item.to));
		}
		lines.push(...contextBlock(trace), ...stderrBlock(trace));
		return lines;
	}
}
