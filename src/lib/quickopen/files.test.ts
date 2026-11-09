import { beforeEach, describe, expect, test } from "bun:test";
import { STALE_MS } from "@/lib/consts/quickopen";
import { cachedFileList, invalidateFileList, rememberFileList } from "@/lib/quickopen/files";

const ROOT = "/proj";

describe("cachedFileList", () => {
	beforeEach(() => {
		invalidateFileList(ROOT);
	});

	test("serves a list inside the window", () => {
		rememberFileList(ROOT, ["a.rs"], 1_000);
		expect(cachedFileList(ROOT, 1_000 + STALE_MS - 1)).toEqual(["a.rs"]);
	});

	test("treats a list as stale once the window passes", () => {
		rememberFileList(ROOT, ["a.rs"], 1_000);
		expect(cachedFileList(ROOT, 1_000 + STALE_MS)).toBeNull();
	});

	test("invalidation drops a fresh list at once", () => {
		rememberFileList(ROOT, ["a.rs"], 1_000);
		invalidateFileList(ROOT);
		expect(cachedFileList(ROOT, 1_000)).toBeNull();
	});
});
