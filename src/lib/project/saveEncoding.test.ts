import { describe, expect, mock, test } from "bun:test";
import type { FileEncoding } from "@/lib/project/buffer";

/**
 * `saveBuffer` writes with the encoding the buffer was read with.
 *
 * The write is the one call that can silently convert a legacy file, so it is pinned here: the
 * backend's own encode step is covered by the Rust suite, and this asserts what the buffer sends.
 */

const writes: Array<{ path: string; text: string; encoding: FileEncoding | null }> = [];

mock.module("@/lib/project/api", () => ({
	writeTextFile: async (path: string, text: string, encoding: FileEncoding | null = null) => {
		writes.push({ path, text, encoding });
	},
	formatterFor: async () => "",
	formatDocument: async (_root: string, _path: string, text: string) => text,
}));

import { saveBuffer } from "@/lib/project/save";

describe("saveBuffer encoding", () => {
	test("a GB18030 buffer is written as GB18030", async () => {
		writes.length = 0;

		await saveBuffer("/p", {
			path: "/p/src/legacy.cpp",
			name: "legacy.cpp",
			text: "中文\n",
			loaded: "old",
			encoding: "gb18030",
		});

		expect(writes).toEqual([
			{ path: "/p/src/legacy.cpp", text: "中文\n", encoding: "gb18030" },
		]);
	});

	test("a remembered UTF-16 byte order is written back", async () => {
		writes.length = 0;

		await saveBuffer("/p", {
			path: "/p/src/wide.cpp",
			name: "wide.cpp",
			text: "int main() {}\n",
			loaded: "old",
			encoding: "utf16-be",
		});

		expect(writes[0]?.encoding).toBe("utf16-be");
	});

	test("a buffer with no known encoding is written as UTF-8", async () => {
		writes.length = 0;

		await saveBuffer("/p", {
			path: "/p/src/fresh.rs",
			name: "fresh.rs",
			text: "fn main() {}\n",
			loaded: "fn main() {}\n",
		});

		expect(writes[0]?.encoding).toBeNull();
	});
});
