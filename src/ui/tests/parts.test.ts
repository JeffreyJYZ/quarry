import { describe, expect, test } from "bun:test";
import { DOCK_TABS, isDockTab, runTabStatus } from "@/ui/tests/parts";

describe("runTabStatus", () => {
	test("says nothing before the first run", () => {
		expect(runTabStatus({ running: false, exited: null })).toBeNull();
	});

	test("says running while a process is live, even after an earlier exit", () => {
		expect(runTabStatus({ running: true, exited: null })).toBe("running");
		expect(runTabStatus({ running: true, exited: { code: 0 } })).toBe("running");
	});

	test("reports the exit code once the process finished", () => {
		expect(runTabStatus({ running: false, exited: { code: 0 } })).toBe("exit 0");
		expect(runTabStatus({ running: false, exited: { code: 101 } })).toBe("exit 101");
	});

	test("reports a kill as killed, whatever the code says", () => {
		expect(runTabStatus({ running: false, exited: { code: null, killed: true } })).toBe(
			"killed",
		);
		expect(runTabStatus({ running: false, exited: { code: 137, killed: true } })).toBe(
			"killed",
		);
		expect(runTabStatus({ running: false, exited: { code: null } })).toBe("killed");
	});
});

describe("dock tabs", () => {
	test("run sits between tests and the debugger", () => {
		expect(DOCK_TABS.indexOf("tests")).toBe(DOCK_TABS.indexOf("run") - 1);
		expect(DOCK_TABS.indexOf("debugger")).toBe(DOCK_TABS.indexOf("run") + 1);
	});

	test("a stored run tab is accepted", () => {
		expect(isDockTab("run")).toBe(true);
		expect(isDockTab("runs")).toBe(false);
	});
});
