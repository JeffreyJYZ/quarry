import { beforeEach, describe, expect, test } from "bun:test";
import { forgetAllDocumentLengths, trackDocumentLength } from "@/lib/editor/liveDocument";
import { installErrorLogging, type ListenerTarget } from "@/lib/log/hooks";
import type { UiFailure } from "@/lib/log/api";

/** A target that keeps its listeners, so a test can fire the event itself. */
function stubTarget() {
	const listeners = new Map<string, (event: unknown) => void>();
	const target: ListenerTarget = {
		addEventListener(type, listener) {
			listeners.set(type, listener);
		},
	};
	return { target, listeners };
}

function capture(): { sent: UiFailure[]; report: (failure: UiFailure) => Promise<string> } {
	const sent: UiFailure[] = [];
	return {
		sent,
		report: async (failure) => {
			sent.push(failure);
			return "/tmp/quarry.log";
		},
	};
}

describe("the window error hook", () => {
	beforeEach(() => {
		forgetAllDocumentLengths();
		trackDocumentLength({}, 0);
	});

	test("records the RangeError a CodeMirror dispatch throws, with stack and document length", async () => {
		const { target, listeners } = stubTarget();
		const { sent, report } = capture();
		installErrorLogging(target, report);
		trackDocumentLength({}, 52);

		const error = new RangeError("Position 61 is out of range for changeset of length 52");
		listeners.get("error")?.({ error });

		await Promise.resolve();
		expect(sent[0]?.name).toBe("RangeError");
		expect(sent[0]?.message).toBe("Position 61 is out of range for changeset of length 52");
		expect(sent[0]?.stack).toContain("RangeError");
		expect(sent[0]?.source).toBe("window.error");
		expect(sent[0]?.documentLength).toBe(52);
	});

	test("a throw that arrives without an Error still carries its message and location", async () => {
		const { target, listeners } = stubTarget();
		const { sent, report } = capture();
		installErrorLogging(target, report);

		listeners.get("error")?.({
			message: "Uncaught RangeError: Position 61 is out of range",
			filename: "http://localhost/assets/index.js",
			lineno: 412,
			colno: 9,
		});

		await Promise.resolve();
		expect(sent[0]?.name).toBe("Uncaught");
		expect(sent[0]?.stack).toBe("at http://localhost/assets/index.js:412:9");
		expect(sent[0]?.documentLength).toBe(0);
	});

	test("a rejected promise is recorded as the failure it carries", async () => {
		const { target, listeners } = stubTarget();
		const { sent, report } = capture();
		installErrorLogging(target, report);

		listeners.get("unhandledrejection")?.({
			reason: new TypeError("cannot read properties of undefined"),
		});

		await Promise.resolve();
		expect(sent[0]?.name).toBe("TypeError");
		expect(sent[0]?.source).toBe("unhandledrejection");
	});

	test("a reporter that rejects does not throw out of the listener", async () => {
		const { target, listeners } = stubTarget();
		installErrorLogging(target, async () => {
			throw new Error("no such command");
		});
		expect(() => listeners.get("error")?.({ error: new Error("boom") })).not.toThrow();
		await Promise.resolve();
	});
});
