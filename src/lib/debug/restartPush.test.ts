import { describe, expect, test } from "bun:test";
import type { BreakpointEntry } from "@/lib/debug/breakpointTypes";
import { restartPush } from "@/lib/debug/restartPush";

function entry(overrides: Partial<BreakpointEntry> = {}): BreakpointEntry {
	return {
		condition: null,
		hitCondition: null,
		logMessage: null,
		enabled: true,
		verified: null,
		message: null,
		temporary: false,
		...overrides,
	};
}

describe("restartPush", () => {
	test("carries the data breakpoints the old session held", () => {
		const plan = restartPush(new Map(), [
			{ dataId: "16FDFDCBC/4", description: "4 bytes at 16FDFDCBC" },
			{ dataId: "16FDFDD00/8", description: "8 bytes at 16FDFDD00" },
		]);

		expect(plan.dataIds).toEqual(["16FDFDCBC/4", "16FDFDD00/8"]);
	});

	test("carries no data breakpoints when none were set", () => {
		expect(restartPush(new Map(), []).dataIds).toEqual([]);
	});

	test("drops only the rows the user disabled", () => {
		const plan = restartPush(
			new Map([
				[
					"/p/src/main.rs",
					new Map([
						[12, entry({ condition: "x > 0" })],
						[40, entry({ enabled: false })],
					]),
				],
			]),
			[],
		);

		expect(plan.files).toHaveLength(1);
		expect(plan.files[0]?.path).toBe("/p/src/main.rs");
		expect(plan.files[0]?.breakpoints).toEqual([
			{
				line: 12,
				condition: "x > 0",
				hitCondition: null,
				logMessage: null,
				enabled: true,
			},
		]);
	});

	test("re-sends a file whose every breakpoint is disabled, so the adapter clears it", () => {
		const plan = restartPush(
			new Map([["/p/src/lib.rs", new Map([[7, entry({ enabled: false })]])]]),
			[],
		);

		expect(plan.files).toEqual([{ path: "/p/src/lib.rs", breakpoints: [] }]);
	});
});
