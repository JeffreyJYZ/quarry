import { useEffect, useRef } from "react";
import { dapReadMemory } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { CHUNK_BYTES, formatAddress, mergeChunk, parseAddress } from "@/lib/debug/memory/hex";
import type { Loaded, Request } from "@/ui/debug/memory/parts";

/** Reads one page in 256-byte chunks, guarding against stale replies. */
export function useMemoryRead({
	session,
	request,
	setLoaded,
	setError,
	setSelected,
	setBusy,
}: {
	session: string;
	request: Request | null;
	setLoaded: (value: Loaded | null) => void;
	setError: (value: string | null) => void;
	setSelected: (value: bigint | null) => void;
	setBusy: (value: boolean) => void;
}) {
	const sequence = useRef(0);

	useEffect(() => {
		if (request === null) {
			sequence.current += 1;
			setLoaded(null);
			setError(null);
			setSelected(null);
			setBusy(false);
			return;
		}
		const { start, size } = request;
		sequence.current += 1;
		const ticket = sequence.current;
		let live = true;
		setBusy(true);
		const read = async () => {
			const bytes: Array<number | null> = new Array(size).fill(null);
			const failures: string[] = [];
			let chunks = 0;
			for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
				const length = Math.min(CHUNK_BYTES, size - offset);
				const chunk = start + BigInt(offset);
				chunks += 1;
				try {
					const dump = await dapReadMemory(session, formatAddress(chunk), length);
					if (!live || ticket !== sequence.current) {
						return;
					}
					const origin = parseAddress(dump.address) ?? chunk;
					const placed = mergeChunk(bytes, start, origin, dump.bytes);
					if (dump.bytes.length < length || placed < dump.bytes.length) {
						failures.push(`short read at ${formatAddress(chunk)}`);
					}
				} catch (failure) {
					if (!live || ticket !== sequence.current) {
						return;
					}
					failures.push(describeError(failure));
				}
			}
			if (!live || ticket !== sequence.current) {
				return;
			}
			setLoaded({ base: start, size, bytes });
			setError(failures.length === chunks ? (failures[0] ?? "Memory read failed") : null);
			setBusy(false);
		};
		void read();
		return () => {
			live = false;
		};
	}, [session, request, setLoaded, setError, setSelected, setBusy]);
}
