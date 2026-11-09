import { describe, expect, test } from "bun:test";
import { type FileBuffer, isDirty } from "@/lib/project/buffer";
import { fileName, parentDir } from "@/lib/project/paths";
import { bufferAction, buffersToRefresh, dirsToRefresh, planWatchBatch } from "@/lib/project/watch";

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

describe("planWatchBatch", () => {
	test("a clean buffer whose file is gone closes its tab", () => {
		const clean = buffer(`${ROOT}/src/main.rs`, "same", "same");
		const plan = planWatchBatch([clean], [clean.path], new Set());
		expect(plan.close.map((entry) => entry.path)).toEqual([clean.path]);
		expect(plan.reload).toEqual([]);
		expect(plan.notices).toEqual(["Deleted main.rs"]);
	});

	test("a dirty buffer whose file is gone keeps its tab and its text", () => {
		const dirty = buffer(`${ROOT}/src/main.rs`, "typed, not saved", "old");
		const plan = planWatchBatch([dirty], [dirty.path], new Set());
		expect(plan.close).toEqual([]);
		expect(plan.keep.map((entry) => entry.text)).toEqual(["typed, not saved"]);
		expect(plan.notices.join(" ")).toContain("unsaved");
	});

	test("a vanished path and one created path with its name move the buffer", () => {
		const dirty = buffer(`${ROOT}/src/main.rs`, "typed", "old");
		const target = `${ROOT}/src/lib/main.rs`;
		const plan = planWatchBatch([dirty], [dirty.path, target], new Set([target]));
		expect(plan.moves).toHaveLength(1);
		expect(plan.moves[0]?.to).toBe(target);
		expect(plan.moves[0]?.name).toBe("main.rs");
		expect(plan.moves[0]?.buffer.text).toBe("typed");
		const moved = plan.moves[0]?.buffer;
		expect(moved !== undefined && isDirty(moved)).toBe(true);
		expect(plan.close).toEqual([]);
	});

	test("two same-named buffers and one created path stay put, nothing clever", () => {
		const a = buffer(`${ROOT}/a/main.rs`, "a", "a");
		const b = buffer(`${ROOT}/b/main.rs`, "b", "b");
		const created = `${ROOT}/c/main.rs`;
		const plan = planWatchBatch([a, b], [a.path, b.path, created], new Set([created]));
		expect(plan.moves).toEqual([]);
		expect(plan.close).toEqual([]);
		expect(plan.keep.map((entry) => entry.path).sort()).toEqual([a.path, b.path]);
	});

	test("a file that still exists is reloaded, not closed", () => {
		const clean = buffer(`${ROOT}/src/main.rs`, "same", "same");
		const plan = planWatchBatch([clean], [clean.path], new Set([clean.path]));
		expect(plan.close).toEqual([]);
		expect(plan.reload.map((entry) => entry.path)).toEqual([clean.path]);
	});

	test("a name comes off the last separator", () => {
		expect(fileName(`${ROOT}/src/main.rs`)).toBe("main.rs");
		expect(fileName("main.rs")).toBe("main.rs");
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
