import { describe, expect, test } from "bun:test";
import { feedChunk } from "@/lib/terminal/ansi";

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
