import { describe, expect, test } from "bun:test";
import { exitStatusText } from "@/lib/run/exitStatus";

describe("exitStatusText", () => {
	test("stopped", () => {
		expect(exitStatusText({ code: null, killed: true })).toBe("stopped");
	});
	test("signal", () => {
		expect(exitStatusText({ code: null })).toBe("terminated by signal");
	});
	test("success", () => {
		expect(exitStatusText({ code: 0 })).toBe("exited with code 0");
	});
	test("failure", () => {
		expect(exitStatusText({ code: 2 })).toBe("exited with code 2");
	});
});
