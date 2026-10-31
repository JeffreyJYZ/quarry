import { parseAddress, ROW_BYTES } from "@/lib/debug/memory/hex";

/** One page read: the address, how many bytes and a serial that changes on every re-read. */
export type Request = {
	start: bigint;
	size: number;
	/** Bumped per read so a repeat read of the same address is a real dependency change. */
	serial: number;
};

export type Loaded = {
	base: bigint;
	size: number;
	/** One slot per requested byte; `null` marks a byte inside an unreadable chunk. */
	bytes: Array<number | null>;
};

export const PAGE_SIZES = [64, 256, 1024];
export const DEFAULT_PAGE = 256;

const ROW_WIDTH_KEY = "quarry.memory.rowWidth";
const PAGE_SIZE_KEY = "quarry.memory.pageSize";

export function storedRowWidth(): number {
	try {
		const value = window.sessionStorage.getItem(ROW_WIDTH_KEY);
		return value === null ? ROW_BYTES : Number(value);
	} catch {
		return ROW_BYTES;
	}
}

export function storeRowWidth(value: number): void {
	try {
		window.sessionStorage.setItem(ROW_WIDTH_KEY, String(value));
	} catch {
		// Session storage can be unavailable; the choice still holds for this mount.
	}
}

export function storedPageSize(): number {
	try {
		const value = window.sessionStorage.getItem(PAGE_SIZE_KEY);
		return value === null ? DEFAULT_PAGE : Number(value);
	} catch {
		return DEFAULT_PAGE;
	}
}

export function storePageSize(value: number): void {
	try {
		window.sessionStorage.setItem(PAGE_SIZE_KEY, String(value));
	} catch {
		// Session storage can be unavailable; the choice still holds for this mount.
	}
}

export function requestFor(address: string | null): Request | null {
	const start = parseAddress(address);
	return start === null ? null : { start, size: DEFAULT_PAGE, serial: 0 };
}
