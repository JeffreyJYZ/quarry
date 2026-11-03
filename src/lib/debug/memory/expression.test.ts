import { describe, expect, test } from "bun:test";
import { addressFromValue } from "@/lib/debug/memory/expression";

describe("addressFromValue", () => {
	test("takes the bare hex a stopped frame reports", () => {
		expect(addressFromValue("0x000000016fdfe9a8")).toBe(0x000000016fdfe9a8n);
	});

	test("takes the hex out of a cast", () => {
		expect(addressFromValue("(int *) 0x1000")).toBe(0x1000n);
		expect(addressFromValue("(struct Node *) 0x7ff7bfeff510")).toBe(0x7ff7bfeff510n);
		expect(addressFromValue("(int (*)(void)) 0x1000")).toBe(0x1000n);
	});

	test("takes a plain number", () => {
		expect(addressFromValue("2")).toBe(2n);
		expect(addressFromValue(" 0 ")).toBe(0n);
	});

	test("takes the assigned form lldb prints for an expression", () => {
		// Measured against lldb-dap: `&q` answers exactly this shape.
		expect(addressFromValue("(int **) $1 = 0x000000016fdfe310")).toBe(0x000000016fdfe310n);
		expect(addressFromValue("(struct Node *) $0 = 0x1000")).toBe(0x1000n);
	});

	test("rejects what is not a location", () => {
		// A scalar evaluates to its value; the pane asks for `&count` instead.
		expect(addressFromValue("quarry")).toBeNull();
		expect(addressFromValue('"quarry"')).toBeNull();
		expect(addressFromValue("{ a = 1, b = 0x20 }")).toBeNull();
		expect(addressFromValue("{ [0] = 'q' }")).toBeNull();
		expect(addressFromValue("0x1000 <main>")).toBeNull();
		// A scalar's assigned value names a number, not a place.
		expect(addressFromValue("(int) $0 = 2")).toBeNull();
	});
});
