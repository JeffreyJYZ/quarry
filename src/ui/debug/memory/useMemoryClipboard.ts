import { useRef, useState } from "react";
import { describeError } from "@/lib/project/errors";
import { formatAddress, formatHexText } from "@/lib/debug/memory/hex";
import type { Loaded } from "@/ui/debug/memory/parts";

/** Copy-to-clipboard helpers with a short "Copied" flash. */
export function useMemoryClipboard({
	loaded,
	setError,
	rangeStart,
	rangeFinish,
}: {
	loaded: Loaded | null;
	setError: (value: string | null) => void;
	rangeStart: bigint | null;
	rangeFinish: bigint | null;
}) {
	const [copied, setCopied] = useState<string | null>(null);
	const copiedTimer = useRef<number | null>(null);

	const flashCopied = (text: string) => {
		setCopied(text);
		if (copiedTimer.current !== null) {
			window.clearTimeout(copiedTimer.current);
		}
		copiedTimer.current = window.setTimeout(() => setCopied(null), 2000);
	};

	const copyHex = async () => {
		if (loaded === null) return;
		try {
			let text = formatHexText(loaded.base, loaded.bytes);
			let count = loaded.bytes.length;
			if (rangeStart !== null && rangeFinish !== null) {
				const start = Number(rangeStart - loaded.base);
				const end = Number(rangeFinish - loaded.base);
				const lo = Math.max(0, Math.min(start, end));
				const hi = Math.min(loaded.bytes.length - 1, Math.max(start, end));
				const selected: number[] = [];
				for (let index = lo; index <= hi; index += 1) {
					const byte = loaded.bytes[index];
					selected.push(byte === null ? 0 : byte);
				}
				text = selected.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
				count = selected.length;
			}
			await navigator.clipboard.writeText(text);
			flashCopied(
				rangeStart !== null && rangeFinish !== null
					? `${count} byte${count === 1 ? "" : "s"}`
					: "page",
			);
		} catch (failure) {
			setError(describeError(failure));
		}
	};

	const copyAddress = async (target: bigint) => {
		const text = formatAddress(target);
		try {
			await navigator.clipboard.writeText(text);
			flashCopied(text);
		} catch (failure) {
			setError(describeError(failure));
		}
	};

	return { copied, copyHex, copyAddress };
}
