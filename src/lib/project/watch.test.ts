import { describe, expect, test } from "bun:test";
import type { FileBuffer } from "@/lib/project/buffer";
import { bufferAction, buffersToRefresh, dirsToRefresh, parentDir } from "@/lib/project/watch";

function buffer(path: string, text: string, loaded: string): FileBuffer {
	return { path, name: path.split("/").pop() ?? path, text, loaded };
}

const ROOT = "/project";

describe("bufferAction", () => {
	test("a file the batch does not name is ignored", () => {
		expect(bufferAction(buffer(`${ROOT}/a.rs`, "x", "x"), new Set([`${ROOT}/b.rs`]))).toBe(
			"ignore",
		);
	});

	test("a clean buffer is reloaded", () => {
		const clean = buffer(`${ROOT}/src/main.rs`, "old", "old");
		expect(bufferAction(clean, new Set([clean.path]))).toBe("reload");
	});

	test("a dirty buffer is never reloaded, it is a conflict", () => {
		const dirty = buffer(`${ROOT}/src/main.rs`, "typed, not saved", "old");
		const action = bufferAction(dirty, new Set([dirty.path]));
		expect(action).not.toBe("reload");
		expect(action).toBe("conflict");
	});
});

describe("buffersToRefresh", () => {
	test("splits one batch into a clean reload and a dirty conflict", () => {
		const clean = buffer(`${ROOT}/src/clean.rs`, "same", "same");
		const dirty = buffer(`${ROOT}/src/dirty.rs`, "unsaved", "saved");
		const untouched = buffer(`${ROOT}/src/other.rs`, "x", "x");
		const result = buffersToRefresh(
			[clean, dirty, untouched],
			new Set([clean.path, dirty.path]),
		);
		expect(result.reload.map((entry) => entry.path)).toEqual([clean.path]);
		expect(result.conflicts.map((entry) => entry.path)).toEqual([dirty.path]);
	});
});

describe("dirsToRefresh", () => {
	test("a changed file refreshes the listed parent only", () => {
		const loaded = new Set([ROOT, `${ROOT}/src`]);
		expect(dirsToRefresh([`${ROOT}/src/main.rs`], loaded)).toEqual([`${ROOT}/src`]);
	});

	test("an unlisted parent is not refreshed, so nothing expands by itself", () => {
		expect(dirsToRefresh([`${ROOT}/vendor/deep/file.rs`], new Set([ROOT]))).toEqual([]);
	});

	test("a changed directory refreshes itself and its parent", () => {
		const loaded = new Set([ROOT, `${ROOT}/src`, `${ROOT}/src/gen`]);
		expect(dirsToRefresh([`${ROOT}/src/gen`], loaded).sort()).toEqual([
			`${ROOT}/src`,
			`${ROOT}/src/gen`,
		]);
	});

	test("one batch names each directory once", () => {
		const loaded = new Set([`${ROOT}/src`]);
		const dirs = dirsToRefresh([`${ROOT}/src/a.rs`, `${ROOT}/src/b.rs`], loaded);
		expect(dirs).toEqual([`${ROOT}/src`]);
	});

	test("a top-level path has no parent above the root", () => {
		expect(parentDir(ROOT)).toBeNull();
		expect(parentDir(`${ROOT}/Cargo.toml`)).toBe(ROOT);
	});
});
