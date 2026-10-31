import { useMemo } from "react";
import {
	buildRows,
	formatAddress,
	type Interpreted,
	interpretAt,
	type MemoryRow,
} from "@/lib/debug/memory/hex";
import type { Loaded } from "@/ui/debug/memory/parts";

/**
 * What the table and the value strip derive from one page.
 *
 * A clicked byte wins; with only a dragged range, the range's start is what the strip explains.
 * Kept out of the pane so the pane stays a layout, not a place where three memos pile up.
 */
export function useMemoryRows({
	loaded,
	rowWidth,
	selected,
	rangeStart,
	rangeFinish,
}: {
	loaded: Loaded | null;
	rowWidth: number;
	selected: bigint | null;
	rangeStart: bigint | null;
	rangeFinish: bigint | null;
}): { rows: MemoryRow[]; interpreted: Interpreted[] | null; selectedLabel: string } {
	const rows = useMemo(
		() => (loaded === null ? [] : buildRows(loaded.base, loaded.bytes, rowWidth)),
		[loaded, rowWidth],
	);

	const interpreted = useMemo<Interpreted[] | null>(() => {
		if (loaded === null) {
			return null;
		}
		const target = selected ?? rangeStart;
		if (target === null) {
			return null;
		}
		const values = interpretAt(loaded.bytes, Number(target - loaded.base));
		return values.length === 0 ? null : values;
	}, [loaded, selected, rangeStart]);

	const selectedLabel =
		selected !== null
			? formatAddress(selected)
			: rangeStart !== null && rangeFinish !== null
				? `${formatAddress(rangeStart)}–${formatAddress(rangeFinish)}`
				: "";

	return { rows, interpreted, selectedLabel };
}
