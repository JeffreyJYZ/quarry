import { formatAddress } from "@/lib/debug/memory/hex";

/**
 * What the pane says when a chunk produced no bytes.
 *
 * The adapter answers an unmapped page with an empty `data` and an `unreadableBytes` count rather
 * than an error, so "short read" alone left the reader guessing. Address zero is called out by name:
 * that is what an uninitialised or null pointer reads as, and it is the common case.
 */
export function readFailureReason(address: bigint, unreadableBytes: number): string {
	if (address === 0n) {
		return "0x0 is null: the pointer is uninitialised or null";
	}
	if (unreadableBytes > 0) {
		return `nothing readable at ${formatAddress(address)} (${unreadableBytes} bytes unreadable)`;
	}
	return `short read at ${formatAddress(address)}`;
}
