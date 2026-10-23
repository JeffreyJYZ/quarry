import { parseAddress } from "@/lib/debug/memory/hex";

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

export function requestFor(address: string | null): Request | null {
	const start = parseAddress(address);
	return start === null ? null : { start, size: DEFAULT_PAGE, serial: 0 };
}
