import { describe, expect, test } from "bun:test";
import { readFailureReason } from "@/lib/debug/memory/readFailure";

describe("readFailureReason", () => {
	test("names a null pointer as null", () => {
		expect(readFailureReason(0n, 4)).toBe("0x0 is null: the pointer is uninitialised or null");
	});

	test("repeats the adapter's unreadable count", () => {
		expect(readFailureReason(0x1000n, 4)).toBe(
			"nothing readable at 0x1000 (4 bytes unreadable)",
		);
	});

	test("falls back to a short read when the adapter gave no reason", () => {
		expect(readFailureReason(0x1000n, 0)).toBe("short read at 0x1000");
	});
});
