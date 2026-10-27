/** Address parsing and formatting shared by the hex and disassembly panes. */

/** Bytes rendered per row when no width has been chosen. */
export const ROW_BYTES = 16;

/** Row widths the hex pane offers, in bytes. */
export const ROW_WIDTHS = [8, 16, 32];

/** Hex digits the offset column is padded to. */
export const OFFSET_DIGITS = 4;

/** Largest count one `readMemory` call may ask for. */
export const CHUNK_BYTES = 256;

/**
 * Parse an address that may arrive bare (`16fdfdcbc`), prefixed (`0x1000014B8`), or in the data
 * breakpoint `dataId` shape (`16FDFDCBC/4`, trailing byte count). Addresses are 64-bit, so they go
 * through `BigInt`, never `Number`.
 */
export function parseAddress(value: string | null | undefined): bigint | null {
	if (value === null || value === undefined) {
		return null;
	}
	const [head] = value.trim().split("/");
	const body = head.startsWith("0x") || head.startsWith("0X") ? head.slice(2) : head;
	if (body === "" || !/^[0-9a-fA-F]+$/.test(body)) {
		return null;
	}
	return BigInt(`0x${body}`);
}

/** `0x` plus lowercase hex, or an empty string when there is no address. */
export function formatAddress(address: bigint | null): string {
	return address === null ? "" : `0x${address.toString(16)}`;
}

/** Pad a row address to a fixed width so every row lines up. */
export function formatRowAddress(address: bigint, digits: number): string {
	return `0x${address.toString(16).padStart(digits, "0")}`;
}

/** Offset of a row from the start of the page, zero-padded so the column lines up. */
export function formatOffset(offset: number, digits: number = OFFSET_DIGITS): string {
	return offset.toString(16).padStart(digits, "0");
}

/** Two lowercase hex digits, or `--` for a byte that could not be read. */
export function hexByte(value: number | null): string {
	return value === null ? "--" : value.toString(16).padStart(2, "0");
}

/** Fixed-width `0x…` rendering of a little-endian value. */
export function hexValue(value: bigint, width: number): string {
	return `0x${value.toString(16).padStart(width * 2, "0")}`;
}

/** Printable ASCII 32..126, a dot for everything else. */
export function asciiByte(value: number | null): string {
	if (value === null || value < 32 || value > 126) {
		return ".";
	}
	return String.fromCharCode(value);
}

/**
 * Hex bytes for one row, padded to `rowBytes` slots so the ASCII column starts at the same place
 * on a short last row as on a full one.
 */
export function hexColumn(bytes: Array<number | null>, rowBytes: number): string {
	const slots: string[] = [];
	for (let index = 0; index < rowBytes; index += 1) {
		slots.push(hexByte(bytes[index] ?? null));
	}
	return slots.join(" ");
}

/** One character per slot: printable ASCII, or `.` for a non-printable or unread byte. */
export function asciiColumn(bytes: Array<number | null>, rowBytes: number): string {
	let text = "";
	for (let index = 0; index < rowBytes; index += 1) {
		text += asciiByte(bytes[index] ?? null);
	}
	return text;
}

/**
 * Place one `readMemory` reply into the page buffer. The adapter may answer from a base other than
 * the one requested, so slots are derived from the reply's own address. Returns bytes placed.
 */
export function mergeChunk(
	bytes: Array<number | null>,
	pageBase: bigint,
	replyBase: bigint,
	replyBytes: number[],
): number {
	const first = Number(replyBase - pageBase);
	let placed = 0;
	for (let index = 0; index < replyBytes.length; index += 1) {
		const slot = first + index;
		if (slot < 0 || slot >= bytes.length) {
			continue;
		}
		bytes[slot] = replyBytes[index] & 0xff;
		placed += 1;
	}
	return placed;
}

export type MemoryRow = {
	address: bigint;
	/** Byte offset of this row from the start of the page, for the offset column. */
	offset: number;
	/** Hex digits every row address is padded to, so the address column stays aligned. */
	digits: number;
	bytes: Array<number | null>;
};

/** Split one page of bytes into rows of `rowBytes`, 16 by default. */
export function buildRows(
	base: bigint,
	bytes: Array<number | null>,
	rowBytes: number = ROW_BYTES,
): MemoryRow[] {
	if (bytes.length === 0) {
		return [];
	}
	const width = Math.max(1, Math.trunc(rowBytes));
	const digits = Math.max(8, (base + BigInt(bytes.length - 1)).toString(16).length);
	const rows: MemoryRow[] = [];
	for (let offset = 0; offset < bytes.length; offset += width) {
		rows.push({
			address: base + BigInt(offset),
			offset,
			digits,
			bytes: bytes.slice(offset, offset + width),
		});
	}
	return rows;
}

export type Interpreted = {
	/** Byte width: 1, 2, 4 or 8. */
	width: number;
	value: bigint;
	/** True when at least one byte of the value sits in an unreadable or out-of-page slot. */
	partial: boolean;
};

/** Little-endian u8/u16/u32/u64 at `offset`, with missing bytes flagged as partial. */
export function interpretAt(bytes: Array<number | null>, offset: number): Interpreted[] {
	if (offset < 0 || offset >= bytes.length) {
		return [];
	}
	return [1, 2, 4, 8].map((width) => {
		let value = 0n;
		let partial = false;
		for (let index = 0; index < width; index += 1) {
			const byte = bytes[offset + index];
			if (byte === null || byte === undefined) {
				partial = true;
				continue;
			}
			value |= BigInt(byte) << BigInt(8 * index);
		}
		return { width, value, partial };
	});
}

/** Render loaded bytes as hex text: `rowBytes` per line, address-prefixed, matching the pane. */
export function formatHexText(
	base: bigint,
	bytes: Array<number | null>,
	rowBytes: number = ROW_BYTES,
): string {
	const rows = buildRows(base, bytes, rowBytes);
	return rows
		.map(
			(row) =>
				`${formatRowAddress(row.address, row.digits)}  ${row.bytes.map(hexByte).join(" ")}`,
		)
		.join("\n");
}
