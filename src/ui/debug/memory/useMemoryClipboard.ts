import { useRef, useState } from "react";
import { describeError } from "@/lib/project/errors";
import { formatAddress, formatHexText } from "@/lib/debug/memory/hex";
import type { Loaded } from "@/ui/debug/memory/parts";

/** Copy-to-clipboard helpers with a short "Copied" flash. */
export function useMemoryClipboard({
	loaded,
	setError,
}: {
	loaded: Loaded | null;
	setError: (value: string | null) => void;
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
			await navigator.clipboard.writeText(formatHexText(loaded.base, loaded.bytes));
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
