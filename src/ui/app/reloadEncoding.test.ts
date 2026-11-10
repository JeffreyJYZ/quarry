import { describe, expect, test } from "bun:test";
import type { TextFile } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { reloaded } from "@/ui/app/externalChanges";

/**
 * A disk reload carries the encoding with the text.
 *
 * The label lives on the buffer rather than in a map keyed by path, so this is the one place a
 * reload could either lose a legacy file's encoding or attach the wrong one: both are pinned here.
 */

function legacy(text = "旧中文\n"): FileBuffer {
	return {
		path: "/project/src/legacy.cpp",
		name: "legacy.cpp",
		text,
		loaded: text,
		encoding: "gb18030",
	};
}

function disk(text: string, encoding: TextFile["encoding"] = "gb18030"): TextFile {
	return { text, encoding };
}

describe("reloaded encoding", () => {
	test("the same path reloaded in its own encoding keeps GB18030, so the next save does too", () => {
		const next = reloaded(legacy(), disk("新中文\n", "gb18030"));

		expect(next?.text).toBe("新中文\n");
		expect(next?.encoding).toBe("gb18030");
	});

	test("a file re-encoded on disk takes the encoding it now has", () => {
		expect(reloaded(legacy(), disk("new", "utf8"))?.encoding).toBe("utf8");
	});

	test("a buffer with no label is UTF-8, so a UTF-8 read of it is no change", () => {
		const unlabelled = { path: "/p/a.rs", name: "a.rs", text: "same", loaded: "same" };

		expect(reloaded(unlabelled, disk("same", "utf8"))).toBeNull();
	});

	test("a legacy file that became UTF-8 on disk stops being reported as legacy", () => {
		expect(reloaded(legacy("same"), disk("same", "utf8"))?.encoding).toBe("utf8");
	});
});
