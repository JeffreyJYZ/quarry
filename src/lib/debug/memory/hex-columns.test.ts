import { describe, expect, test } from "bun:test";
import {
	asciiColumn,
	buildRows,
	formatHexText,
	formatOffset,
	hexColumn,
} from "@/lib/debug/memory/hex";

describe("buildRows row widths", () => {
	test("8-byte rows", () => {
		const bytes = Array.from({ length: 20 }, (_, index) => index);
		const rows = buildRows(0n, bytes, 8);
		expect(rows.length).toBe(3);
		expect(rows[0].bytes.length).toBe(8);
		expect(rows[2].bytes.length).toBe(4);
		expect(rows[1].offset).toBe(8);
	});

	test("32-byte rows fit the same bytes in one row", () => {
		const bytes = Array.from({ length: 20 }, (_, index) => index);
		const rows = buildRows(0x100n, bytes, 32);
		expect(rows.length).toBe(1);
		expect(rows[0].offset).toBe(0);
	});

	test("a width below one byte still yields one byte per row", () => {
		expect(buildRows(0n, [1, 2], 0).length).toBe(2);
	});
});

describe("formatOffset", () => {
	test("pads to four digits", () => {
		expect(formatOffset(0)).toBe("0000");
		expect(formatOffset(0x20)).toBe("0020");
	});

	test("honours a custom width", () => {
		expect(formatOffset(0x20, 2)).toBe("20");
	});
});

describe("hexColumn", () => {
	test("pads a short row to the row width", () => {
		expect(hexColumn([1, 2], 4)).toBe("01 02 -- --");
	});

	test("an unread byte renders as --", () => {
		expect(hexColumn([0xff, null], 2)).toBe("ff --");
	});
});

describe("asciiColumn", () => {
	test("printables pass through, the rest become dots", () => {
		expect(asciiColumn([0x48, 0x69, 0x00, 0x7f], 4)).toBe("Hi..");
	});

	test("missing slots are dots so the column stays aligned", () => {
		expect(asciiColumn([0x41], 3)).toBe("A..");
	});
});

describe("formatHexText row width", () => {
	test("honours a custom row width", () => {
		expect(formatHexText(0x1000n, [1, 2, 3], 8)).toBe("0x00001000  01 02 03");
	});
});
