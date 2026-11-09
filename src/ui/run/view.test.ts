import { describe, expect, test } from "bun:test";
import type { RunLine } from "@/lib/run/runOutput";
import { copyText, lineClass, stopLabel, stripAnsi } from "@/ui/run/view";

function row(seq: number, line: string, stream: RunLine["stream"] = "stdout"): RunLine {
	return { seq, stream, line, open: false };
}

describe("the run panel", () => {
	test("a stdout line is plain and a stderr line is marked", () => {
		expect(lineClass("stdout")).toBe("run-line");
		expect(lineClass("stderr")).toBe("run-line stderr");
	});

	test("Stop says what the backend is doing", () => {
		expect(stopLabel(false)).toBe("Stop");
		expect(stopLabel(true)).toBe("Stopping…");
	});

	test("a line keeps its merged text", () => {
		const lines = [row(1, "serving on port 8080")];

		expect(copyText(lines)).toBe("serving on port 8080");
	});

	test("colour escapes are dropped from the text", () => {
		expect(stripAnsi("\x1b[31merror\x1b[0m: bad")).toBe("error: bad");
	});

	test("copied output has one line per row, in order", () => {
		const lines = [row(1, "one"), row(2, "\x1b[32mtwo\x1b[0m", "stderr"), row(3, "three")];

		expect(copyText(lines)).toBe("one\ntwo\nthree");
	});
});
