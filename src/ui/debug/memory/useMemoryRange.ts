import { useCallback, useEffect, useState } from "react";
import { dapWriteMemory } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { formatAddress } from "@/lib/debug/memory/hex";

/** Range selection state and the keyboard-driven range write. */
export function useMemoryRange({
	session,
	setError,
	refresh,
	editMode,
}: {
	session: string;
	setError: (value: string | null) => void;
	refresh: () => void;
	editMode: boolean;
}) {
	const [rangeAnchor, setRangeAnchor] = useState<bigint | null>(null);
	const [rangeEnd, setRangeEnd] = useState<bigint | null>(null);
	const [rangeInput, setRangeInput] = useState("");

	let rangeStart: bigint | null = null;
	let rangeFinish: bigint | null = null;
	if (rangeAnchor !== null && rangeEnd !== null) {
		if (rangeAnchor < rangeEnd) {
			rangeStart = rangeAnchor;
			rangeFinish = rangeEnd;
		} else {
			rangeStart = rangeEnd;
			rangeFinish = rangeAnchor;
		}
	}
	const rangeLabel =
		rangeStart !== null && rangeFinish !== null
			? `${formatAddress(rangeStart)}–${formatAddress(rangeFinish)}`
			: null;
	const rangeSize =
		rangeStart !== null && rangeFinish !== null ? Number(rangeFinish - rangeStart + 1n) : 0;

	const commitRange = useCallback(async () => {
		if (!session || rangeStart === null || rangeFinish === null) {
			return;
		}
		if (rangeInput.length !== rangeSize * 2) {
			return;
		}
		const bytes: number[] = [];
		for (let index = 0; index < rangeSize; index += 1) {
			bytes.push(Number.parseInt(rangeInput.slice(index * 2, index * 2 + 2), 16));
		}
		if (bytes.some((value) => Number.isNaN(value))) {
			return;
		}
		try {
			await dapWriteMemory(session, formatAddress(rangeStart), bytes);
			setRangeInput("");
			refresh();
		} catch (failure) {
			setError(describeError(failure));
		}
	}, [session, rangeStart, rangeFinish, rangeSize, rangeInput, refresh, setError]);

	useEffect(() => {
		if (!editMode || rangeStart === null || rangeFinish === null) {
			return;
		}
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target !== null &&
				(target.tagName === "INPUT" ||
					target.tagName === "SELECT" ||
					target.tagName === "TEXTAREA")
			) {
				return;
			}
			if (event.key === "Escape") {
				setRangeInput("");
				setRangeAnchor(null);
				setRangeEnd(null);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				void commitRange();
				return;
			}
			if (event.key === "Backspace") {
				setRangeInput((value) => value.slice(0, -1));
				return;
			}
			if (/^[0-9a-fA-F]$/.test(event.key)) {
				setRangeInput((value) => {
					const next = (value + event.key).slice(0, rangeSize * 2);
					return next;
				});
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [editMode, rangeStart, rangeFinish, rangeSize, commitRange]);

	return {
		rangeAnchor,
		setRangeAnchor,
		rangeEnd,
		setRangeEnd,
		rangeInput,
		setRangeInput,
		rangeStart,
		rangeFinish,
		rangeLabel,
		rangeSize,
		commitRange,
	};
}
