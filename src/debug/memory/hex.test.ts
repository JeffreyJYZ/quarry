import { describe, expect, test } from "bun:test";
import {
	asciiByte,
	buildRows,
	formatAddress,
	formatRowAddress,
	hexByte,
	hexValue,
	interpretAt,
	mergeChunk,
	parseAddress,
	ROW_BYTES,
} from "./hex";

describe("parseAddress", () => {
	test("bare hex", () => {
		expect(parseAddress("16fdfdcbc")).toBe(0x16fdfdcbcn);
	});

	test("0x prefix", () => {
		expect(parseAddress("0x1000014B8")).toBe(0x1000014b8n);
	});

	test("0X prefix", () => {
		expect(parseAddress("0Xabc")).toBe(0xabcn);
	});

	test("dataId shape uses head before slash", () => {
		expect(parseAddress("16FDFDCBC/4")).toBe(0x16fdfdcbcn);
	});

	test("null returns null", () => {
		expect(parseAddress(null)).toBeNull();
	});

	test("undefined returns null", () => {
		expect(parseAddress(undefined)).toBeNull();
	});

	test("invalid returns null", () => {
		expect(parseAddress("zzz")).toBeNull();
		expect(parseAddress("")).toBeNull();
	});

	test("whitespace trimmed", () => {
		expect(parseAddress("  0x10  ")).toBe(0x10n);
	});
});

describe("formatAddress", () => {
	test("null -> empty", () => {
		expect(formatAddress(null)).toBe("");
	});

	test("value -> 0x lowercase", () => {
		expect(formatAddress(0xabcn)).toBe("0xabc");
	});
});

describe("formatRowAddress", () => {
	test("pads to digits", () => {
		expect(formatRowAddress(0x10n, 8)).toBe("0x00000010");
	});
});

describe("hexByte", () => {
	test("null -> --", () => {
		expect(hexByte(null)).toBe("--");
	});

	test("value -> two hex digits", () => {
		expect(hexByte(5)).toBe("05");
		expect(hexByte(255)).toBe("ff");
	});
});

describe("hexValue", () => {
	test("fixed width little-endian display value", () => {
		expect(hexValue(0xabn, 2)).toBe("0x00ab");
	});
});

describe("asciiByte", () => {
	test("printable 32..126", () => {
		expect(asciiByte(65)).toBe("A");
	});

	test("non-printable -> dot", () => {
		expect(asciiByte(0)).toBe(".");
		expect(asciiByte(null)).toBe(".");
		expect(asciiByte(127)).toBe(".");
	});
});

describe("mergeChunk", () => {
	test("places bytes by reply base offset", () => {
		const bytes: Array<number | null> = [null, null, null, null];
		const placed = mergeChunk(bytes, 0n, 2n, [0xaa, 0xbb]);
		expect(placed).toBe(2);
		expect(bytes).toEqual([null, null, 0xaa, 0xbb]);
	});

	test("out-of-page slots skipped", () => {
		const bytes: Array<number | null> = [null, null];
		const placed = mergeChunk(bytes, 0n, 5n, [0xaa]);
		expect(placed).toBe(0);
		expect(bytes).toEqual([null, null]);
	});
});

describe("buildRows", () => {
	test("empty bytes -> empty", () => {
		expect(buildRows(0n, [])).toEqual([]);
	});

	test("single row under 16 bytes", () => {
		const rows = buildRows(0x100n, [1, 2, 3]);
		expect(rows.length).toBe(1);
		expect(rows[0].address).toBe(0x100n);
		expect(rows[0].bytes).toEqual([1, 2, 3]);
	});

	test("splits into 16-byte rows", () => {
		const bytes = Array.from({ length: 20 }, (_, i) => i);
		const rows = buildRows(0n, bytes);
		expect(rows.length).toBe(2);
		expect(rows[0].bytes.length).toBe(ROW_BYTES);
		expect(rows[1].bytes.length).toBe(4);
	});

	test("digits at least 8", () => {
		const rows = buildRows(0n, [1]);
		expect(rows[0].digits).toBe(8);
	});
});

describe("interpretAt", () => {
	test("out of range returns empty", () => {
		expect(interpretAt([1, 2], -1)).toEqual([]);
		expect(interpretAt([1, 2], 2)).toEqual([]);
	});

	test("little-endian u16/u32", () => {
		const bytes = [0x34, 0x12, 0x78, 0x56, 0, 0, 0, 0];
		const r = interpretAt(bytes, 0);
		expect(r[1].value).toBe(0x1234n); // u16
		expect(r[2].value).toBe(0x56781234n); // u32
	});

	test("partial at page edge", () => {
		const bytes = [0xaa, 0xbb];
		const r = interpretAt(bytes, 1);
		// u32 at offset 1 needs bytes 1,2,3 -> partial
		expect(r[2].partial).toBe(true);
		// u16 at offset1 needs 1,2 -> partial
		expect(r[1].partial).toBe(true);
		// u8 not partial
		expect(r[0].partial).toBe(false);
	});

	test("null byte flags partial", () => {
		const bytes: Array<number | null> = [0xaa, null];
		const r = interpretAt(bytes, 0);
		expect(r[1].partial).toBe(true);
	});
});
