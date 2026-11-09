import { describe, expect, test } from "bun:test";
import { exitStatusText, signalName } from "@/lib/run/exitStatus";

describe("exitStatusText", () => {
	test("stopped", () => {
		expect(exitStatusText({ code: null, signal: null, killed: true })).toBe("stopped");
	});

	test("a stop wins over the signal it produced", () => {
		expect(exitStatusText({ code: null, signal: 9, killed: true })).toBe("stopped");
	});

	test("a signal is named", () => {
		expect(exitStatusText({ code: null, signal: 11, killed: false })).toBe(
			"terminated by SIGSEGV",
		);
	});

	test("an unnamed signal keeps its number", () => {
		expect(exitStatusText({ code: null, signal: 7 })).toBe("terminated by signal 7");
	});

	test("no code and no signal is not exit 0", () => {
		expect(exitStatusText({ code: null, signal: null })).toBe("terminated without a status");
	});

	test("success", () => {
		expect(exitStatusText({ code: 0, signal: null })).toBe("exited with code 0");
	});

	test("failure", () => {
		expect(exitStatusText({ code: 2, signal: null })).toBe("exited with code 2");
	});
});

describe("signalName", () => {
	test("names the signals a run dies from", () => {
		expect(signalName(2)).toBe("SIGINT");
		expect(signalName(6)).toBe("SIGABRT");
		expect(signalName(15)).toBe("SIGTERM");
	});

	test("falls back to the number", () => {
		expect(signalName(31)).toBe("signal 31");
	});
});
