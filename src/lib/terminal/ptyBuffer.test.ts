import { describe, expect, test } from "bun:test";
import {
	applyChunks,
	MAX_CHARS,
	MAX_CHUNKS,
	MAX_IDS,
	PtyBuffer,
	withChunk,
} from "@/lib/terminal/ptyBuffer";
import { emptySession } from "@/lib/terminal/sessions";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const stamp = (name: string): string => `${ESC}]7;file://host/Users/jyz/${name}${BEL}`;

describe("PtyBuffer", () => {
	test("take returns the chunks in order and clears them", () => {
		const buffer = new PtyBuffer();
		buffer.push("pty-1", "a");
		buffer.push("pty-1", "b");
		expect(buffer.take("pty-1")).toEqual(["a", "b"]);
		expect(buffer.take("pty-1")).toEqual([]);
		expect(buffer.has("pty-1")).toBe(false);
	});

	test("an unknown id and an empty chunk are no-ops", () => {
		const buffer = new PtyBuffer();
		buffer.push("pty-1", "");
		expect(buffer.has("pty-1")).toBe(false);
		expect(buffer.take("pty-9")).toEqual([]);
	});

	test("discard forgets an id without replaying it", () => {
		const buffer = new PtyBuffer();
		buffer.push("pty-1", "dropped");
		buffer.discard("pty-1");
		expect(buffer.take("pty-1")).toEqual([]);
	});

	test("oldest chunks fall out past the chunk cap", () => {
		const buffer = new PtyBuffer();
		for (let i = 0; i < MAX_CHUNKS + 6; i += 1) buffer.push("pty-1", `${i}`);
		const chunks = buffer.take("pty-1");
		expect(chunks.length).toBe(MAX_CHUNKS);
		expect(chunks[chunks.length - 1]).toBe(`${MAX_CHUNKS + 5}`);
		expect(chunks).not.toContain("0");
	});

	test("oldest chunks fall out past the byte cap", () => {
		const buffer = new PtyBuffer();
		const chunk = "x".repeat(4096);
		for (let i = 0; i < 40; i += 1) buffer.push("pty-1", chunk);
		const kept = buffer.take("pty-1");
		expect(kept.length).toBe(MAX_CHARS / 4096);
		expect(kept.every((entry) => entry === chunk)).toBe(true);
	});

	test("one oversized chunk is kept rather than emptied", () => {
		const buffer = new PtyBuffer();
		buffer.push("pty-1", "y".repeat(MAX_CHARS * 2));
		expect(buffer.take("pty-1").length).toBe(1);
	});

	test("the id map is capped, oldest id first", () => {
		const buffer = new PtyBuffer();
		for (let i = 0; i < MAX_IDS + 2; i += 1) buffer.push(`pty-${i}`, `${i}`);
		expect(buffer.size).toBe(MAX_IDS);
		expect(buffer.has("pty-0")).toBe(false);
		expect(buffer.has(`pty-${MAX_IDS + 1}`)).toBe(true);
	});
});

describe("applyChunks", () => {
	test("replays chunks into the scrollback in order", () => {
		const session = emptySession(1, "/tmp");
		const next = applyChunks({ ...session, ptyId: "pty-1" }, ["a\n", "b"]);
		expect(next.lines).toEqual(["a", "b"]);
		expect(next.ptyId).toBe("pty-1");
	});

	test("an empty list leaves the session untouched", () => {
		const session = emptySession(1, "/tmp");
		expect(applyChunks(session, [])).toBe(session);
	});

	test("the last OSC 7 cwd in the replay wins", () => {
		const session = emptySession(1, "/tmp");
		const next = applyChunks(session, [stamp("one"), "prompt$ ", stamp("two")]);
		expect(next.cwd).toBe("/Users/jyz/two");
	});
});

describe("withChunk", () => {
	test("text and cwd arrive together", () => {
		const session = emptySession(1, "/tmp");
		const next = withChunk(session, `${stamp("src")}prompt$ `);
		expect(next.lines[0]).toContain("prompt$ ");
		expect(next.cwd).toBe("/Users/jyz/src");
	});

	test("a chunk without OSC 7 keeps the old cwd", () => {
		const session = { ...emptySession(1, "/tmp"), cwd: "/kept" };
		expect(withChunk(session, "hello").cwd).toBe("/kept");
	});
});
