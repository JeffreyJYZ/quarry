#!/usr/bin/env bun
/**
 * The error a request that will never be answered raises.
 *
 * Distinguished from a refusal (`success: false`), which is still a conversation: this one means the
 * process is gone. Before `initialize` that is not a session failure at all — the adapter never
 * started, so the row skips with the reason instead of reddening a job it cannot influence. The
 * status and the adapter's own words travel with it, because they are the whole of the evidence.
 */

import { describeExit } from "./windows-debug-exit";

export class AdapterGone extends Error {
	constructor(
		readonly command: string,
		readonly exit: number | null,
		readonly said: string,
	) {
		super(
			`${command} was never answered: the adapter exited ${describeExit(exit)}` +
				(said === "" ? "; it printed nothing" : `; it said: ${said}`),
		);
		this.name = "AdapterGone";
	}
}
