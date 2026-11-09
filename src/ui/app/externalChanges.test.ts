import { describe, expect, test } from "bun:test";
import type { FileBuffer } from "@/lib/project/buffer";
import { reloaded } from "@/ui/app/externalChanges";

function buffer(text: string, loaded: string): FileBuffer {
	return { path: "/project/src/main.rs", name: "main.rs", text, loaded };
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
