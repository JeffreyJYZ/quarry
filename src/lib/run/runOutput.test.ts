import { describe, expect, test } from "bun:test";
import { MAX_RUN_LINES } from "@/lib/consts/run";
import {
	appendNotice,
	appendOutput,
	bufferedFor,
	type OutputEvent,
	type PendingEvent,
	type RunLine,
} from "@/lib/run/runOutput";

function event(seq: number, line: string, more = false, stream = "stdout"): OutputEvent {
	return { runId: "run-1", seq, stream, line, more };
}

function texts(lines: RunLine[]): string[] {
	return lines.map((row) => row.line);
}

describe("appendOutput", () => {
	test("a closed line is its own row", () => {
		const lines = appendOutput([], event(1, "compiling"));

		expect(texts(lines)).toEqual(["compiling"]);
		expect(lines[0].stream).toBe("stdout");
		expect(lines[0].open).toBe(false);
	});

	test("a chunk without a newline opens a row that the next chunk continues", () => {
		const first = appendOutput([], event(1, "serving on ", true));
		const second = appendOutput(first, event(2, "port 8080", false));

		expect(texts(second)).toEqual(["serving on port 8080"]);
		expect(second).toHaveLength(1);
		expect(second[0].open).toBe(false);
	});

	test("a row stays open across several chunks", () => {
		let lines = appendOutput([], event(1, "10", true));
		lines = appendOutput(lines, event(2, "%", true));
		lines = appendOutput(lines, event(3, " done", false));

		expect(texts(lines)).toEqual(["10% done"]);
	});

	test("stderr does not merge into an open stdout row", () => {
		const first = appendOutput([], event(1, "partial", true));
		const second = appendOutput(first, event(2, "warning", false, "stderr"));

		expect(texts(second)).toEqual(["partial", "warning"]);
		expect(second[1].stream).toBe("stderr");
	});

	test("an event that arrives out of order is placed by its sequence", () => {
		const first = appendOutput([], event(1, "one"));
		const third = appendOutput(first, event(3, "three"));
		const second = appendOutput(third, event(2, "two"));

		expect(texts(second)).toEqual(["one", "two", "three"]);
		expect(second.map((row) => row.seq)).toEqual([1, 2, 3]);
	});

	test("the oldest rows are dropped at the cap", () => {
		let lines: RunLine[] = [];
		for (let seq = 1; seq <= MAX_RUN_LINES + 5; seq += 1) {
			lines = appendOutput(lines, event(seq, `line ${seq}`));
		}

		expect(lines).toHaveLength(MAX_RUN_LINES);
		expect(lines[0].line).toBe("line 6");
		expect(lines[lines.length - 1].line).toBe(`line ${MAX_RUN_LINES + 5}`);
	});

	test("an unknown stream name reads as stdout", () => {
		const lines = appendOutput([], event(1, "hello", false, "something else"));

		expect(lines[0].stream).toBe("stdout");
	});
});

describe("appendNotice", () => {
	test("numbers the line after the console and marks it stderr", () => {
		const lines = appendNotice([], ["cannot start /bin/app: missing"]);

		expect(lines).toHaveLength(1);
		expect(lines[0].seq).toBe(1);
		expect(lines[0].stream).toBe("stderr");
		expect(lines[0].line).toBe("cannot start /bin/app: missing");
	});

	test("keeps a merged row whole when a notice follows it", () => {
		const open = appendOutput([], event(1, "half a line", true));
		const lines = appendNotice(open, ["build failed"]);

		expect(texts(lines)).toEqual(["half a line", "build failed"]);
		expect(lines[0].open).toBe(true);
	});
});

describe("bufferedFor", () => {
	test("keeps only the events of the run that started", () => {
		const pending: PendingEvent[] = [
			{ kind: "output", event: event(1, "from the old run") },
			{ kind: "output", event: { ...event(2, "from the new run"), runId: "run-2" } },
			{
				kind: "exited",
				event: { runId: "run-2", seq: 3, code: 0, signal: null },
			},
		];

		const kept = bufferedFor(pending, "run-2");

		expect(kept).toHaveLength(2);
		expect(kept.every((entry) => entry.event.runId === "run-2")).toBe(true);
	});
});
