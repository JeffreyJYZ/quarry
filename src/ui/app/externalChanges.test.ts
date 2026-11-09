import { describe, expect, test } from "bun:test";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { type FileBuffer, isDirty } from "@/lib/project/buffer";
import { externalChangeHandler, reloaded } from "@/ui/app/externalChanges";

function buffer(text = "same", loaded = text): FileBuffer {
	return { path: "/project/src/main.rs", name: "main.rs", text, loaded };
}

function bufferAt(path: string, text = "same", loaded = text): FileBuffer {
	return { path, name: path.split("/").pop() ?? path, text, loaded };
}

/** Run one batch against a fake disk and record every buffer-list and side-effect update. */
function harness(initial: readonly FileBuffer[], existing: readonly string[]) {
	let buffers = [...initial];
	const there = new Set(existing);
	const notices: string[] = [];
	const closed: string[] = [];
	const moved: Array<[string, string]> = [];
	const setBuffers: Dispatch<SetStateAction<FileBuffer[]>> = (next) => {
		buffers = typeof next === "function" ? next(buffers) : next;
	};
	const handler = externalChangeHandler(
		{
			buffers: { current: initial } as RefObject<FileBuffer[]>,
			mounted: { current: true } as RefObject<boolean>,
		},
		setBuffers,
		(message) => notices.push(message),
		{ read: async () => "from disk", exists: async (path) => there.has(path) },
		{ onClosed: (path) => closed.push(path), onMoved: (from, to) => moved.push([from, to]) },
	);
	return { handler, notices, closed, moved, current: () => buffers };
}

describe("reloaded", () => {
	test("a buffer that stayed clean takes the disk text", () => {
		const next = reloaded(buffer("old", "old"), "new from disk");
		expect(next?.text).toBe("new from disk");
		expect(next?.loaded).toBe("new from disk");
	});

	test("a buffer edited during the read is left alone", () => {
		expect(reloaded(buffer("typed while reading", "old"), "new from disk")).toBeNull();
	});

	test("unchanged disk text is not applied, so no render is wasted", () => {
		expect(reloaded(buffer("same", "same"), "same")).toBeNull();
	});
});

describe("externalChangeHandler", () => {
	test("a deleted clean buffer closes and leaves the recents list", async () => {
		const gone = bufferAt("/project/src/main.rs");
		const run = harness([gone], []);
		await run.handler([gone.path]);
		expect(run.current()).toEqual([]);
		expect(run.closed).toEqual([gone.path]);
		expect(run.notices.join(" ")).toContain("main.rs");
	});

	test("a deleted dirty buffer keeps its tab and its text", async () => {
		const dirty = bufferAt("/project/src/main.rs", "typed, not saved", "saved");
		const run = harness([dirty], []);
		await run.handler([dirty.path]);
		expect(run.current()).toHaveLength(1);
		expect(run.current()[0]?.text).toBe("typed, not saved");
		expect(run.closed).toEqual([]);
		const notice = run.notices.join(" ").toLowerCase();
		expect(notice).toContain("deleted");
		expect(notice).toContain("unsaved");
	});

	test("an external rename moves the buffer and keeps it dirty", async () => {
		const dirty = bufferAt("/project/src/main.rs", "typed", "saved");
		const target = "/project/src/lib/main.rs";
		const run = harness([dirty], [target]);
		await run.handler([dirty.path, target]);
		expect(run.current()).toHaveLength(1);
		const moved = run.current()[0];
		expect(moved?.path).toBe(target);
		expect(moved?.name).toBe("main.rs");
		expect(moved?.text).toBe("typed");
		expect(moved !== undefined && isDirty(moved)).toBe(true);
		expect(run.moved).toEqual([[dirty.path, target]]);
	});

	test("one batch of three paths asks for one source-control refresh", async () => {
		const a = bufferAt("/project/src/a.rs");
		const b = bufferAt("/project/src/b.rs");
		const c = bufferAt("/project/src/c.rs");
		const run = harness([a, b, c], [a.path, b.path, c.path]);
		let refreshes = 0;
		await run.handler([a.path, b.path, c.path], () => {
			refreshes += 1;
		});
		expect(refreshes).toBe(1);
	});
});
