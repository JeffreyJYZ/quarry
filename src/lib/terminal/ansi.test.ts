import { describe, expect, test } from "bun:test";
import { feedChunk, parseAnsi } from "@/lib/terminal/ansi";

describe("parseAnsi", () => {
	test("plain text is one unstyled run", () => {
		expect(parseAnsi("hello")).toEqual([
			{
				text: "hello",
				fg: null,
				bg: null,
				bold: false,
				dim: false,
				italic: false,
				underline: false,
			},
		]);
	});

	test("basic, bright and reset colours", () => {
		const runs = parseAnsi("\u001b[32mgreen\u001b[0m \u001b[91mred\u001b[39m");
		expect(runs[0].text).toBe("green");
		expect(runs[0].fg).toBe("#7fc98f");
		expect(runs[1].text).toBe(" ");
		expect(runs[1].fg).toBeNull();
		expect(runs[2].text).toBe("red");
		expect(runs[2].fg).toBe("#ef8790");
	});

	test("256-colour and truecolour", () => {
		const [cube] = parseAnsi("\u001b[38;5;196mX\u001b[0m");
		expect(cube.fg).toBe("rgb(255 0 0)");
		const [grey] = parseAnsi("\u001b[38;5;240mX\u001b[0m");
		expect(grey.fg).toBe("rgb(88 88 88)");
		const [truecolour] = parseAnsi("\u001b[38;2;18;52;86mX\u001b[0m");
		expect(truecolour.fg).toBe("rgb(18 52 86)");
	});

	test("bold and underline, then their resets", () => {
		const [bold] = parseAnsi("\u001b[1;4mX\u001b[22;24m");
		expect(bold.bold).toBe(true);
		expect(bold.underline).toBe(true);
		const runs = parseAnsi("\u001b[1mX\u001b[22mY");
		expect(runs[0].bold).toBe(true);
		expect(runs[1].bold).toBe(false);
	});

	test("cursor moves and OSC titles are dropped, not printed", () => {
		expect(parseAnsi("\u001b[2K\u001b]0;title\u0007ok")).toEqual([
			{
				text: "ok",
				fg: null,
				bg: null,
				bold: false,
				dim: false,
				italic: false,
				underline: false,
			},
		]);
	});

	test("a background colour and its reset", () => {
		const [painted] = parseAnsi("\u001b[41mX\u001b[49m");
		expect(painted.bg).toBe("#e06c75");
		const runs = parseAnsi("\u001b[41mX\u001b[49mY");
		expect(runs[1].bg).toBeNull();
	});

	test("empty input still yields one empty run", () => {
		expect(parseAnsi("")[0].text).toBe("");
	});
});

describe("feedChunk", () => {
	test("newlines start lines and text appends to the last", () => {
		expect(feedChunk([], "a\nb")).toEqual(["a", "b"]);
		expect(feedChunk(["a"], "bc")).toEqual(["abc"]);
	});

	test("carriage return overwrites the current line", () => {
		expect(feedChunk([], "progress 10%\rprogress 90%")).toEqual(["progress 90%"]);
	});

	test("a shorter carriage-return rewrite leaves no tail", () => {
		expect(feedChunk([], "downloading 100%\rdone")).toEqual(["doneloading 100%"]);
	});

	test("backspace removes a column", () => {
		expect(feedChunk([], "abc\b\bX")).toEqual(["aXc"]);
	});

	test("a redrawn prompt line replaces the previous one", () => {
		const lines = feedChunk([], "user@host ~ %\ruser@host ~/src %");
		expect(lines).toEqual(["user@host ~/src %"]);
	});
});
