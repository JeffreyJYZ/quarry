import { describe, expect, test } from "bun:test";
import { forgetClosed, rememberClosed, takeClosed } from "@/lib/editor/closedTabs";
import type { FileBuffer } from "@/lib/project/buffer";

const buffer: FileBuffer = { path: "/a.rs", name: "a.rs", text: "fn main() {}", loaded: "" };

describe("closed tab slot", () => {
	test("one reopen per close", () => {
		rememberClosed(buffer);
		expect(takeClosed()).toEqual(buffer);
		expect(takeClosed()).toBeNull();
	});

	test("a second close replaces the first", () => {
		rememberClosed(buffer);
		const other: FileBuffer = { ...buffer, path: "/b.rs", name: "b.rs" };
		rememberClosed(other);
		expect(takeClosed()?.path).toBe("/b.rs");
	});

	test("forgetting empties the slot", () => {
		rememberClosed(buffer);
		forgetClosed();
		expect(takeClosed()).toBeNull();
	});
});
