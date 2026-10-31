import { useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { dapWriteMemory } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { formatAddress, hexByte } from "@/lib/debug/memory/hex";
import { useMemoryRange } from "@/ui/debug/memory/useMemoryRange";
import type { Loaded } from "@/ui/debug/memory/parts";

/** Editable hex cells, delegating range state to a sibling hook. */
export function useMemoryEdit({
	session,
	loaded,
	setError,
	setSelected,
	refresh,
}: {
	session: string;
	loaded: Loaded | null;
	setError: (value: string | null) => void;
	setSelected: (value: bigint | null) => void;
	refresh: () => void;
}) {
	const [editMode, setEditMode] = useState(false);
	const [editing, setEditing] = useState<bigint | null>(null);
	const [editValue, setEditValue] = useState("");

	const range = useMemoryRange({ session, setError, refresh, editMode });

	const startRange = (cell: bigint) => {
		range.setRangeAnchor(cell);
		range.setRangeEnd(cell);
		setSelected(null);
	};

	const extendRange = (cell: bigint) => {
		if (range.rangeAnchor === null) {
			return;
		}
		range.setRangeEnd(cell);
		setSelected(null);
	};

	const commitEdit = async (cell: bigint) => {
		if (!session) {
			setEditing(null);
			return;
		}
		if (editValue.length !== 2) {
			setEditing(null);
			return;
		}
		const value = Number.parseInt(editValue, 16);
		if (Number.isNaN(value)) {
			setEditing(null);
			return;
		}
		try {
			await dapWriteMemory(session, formatAddress(cell), [value]);
			setEditing(null);
			refresh();
		} catch (failure) {
			setError(describeError(failure));
			setEditing(null);
		}
	};

	const select = (cell: bigint, shiftKey: boolean) => {
		if (shiftKey) {
			if (range.rangeAnchor === null) {
				range.setRangeAnchor(cell);
			} else {
				range.setRangeEnd(cell);
			}
			return;
		}
		setSelected(cell);
		range.setRangeAnchor(null);
		range.setRangeEnd(null);
		range.setRangeInput("");
	};

	const beginEdit = (cell: bigint, byte: number | null) => {
		if (!editMode || !session) {
			return;
		}
		if (byte === null) {
			return;
		}
		setEditing(cell);
		setEditValue(hexByte(byte));
	};

	const handleEditChange = (event: ChangeEvent<HTMLInputElement>) => {
		const filtered = event.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 2);
		setEditValue(filtered);
	};

	const handleEditKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, cell: bigint) => {
		if (event.key === "Enter") {
			event.preventDefault();
			void commitEdit(cell);
		} else if (event.key === "Escape") {
			event.preventDefault();
			setEditing(null);
			setEditValue("");
		} else if (event.key === "Tab") {
			event.preventDefault();
			void commitEdit(cell).then(() => {
				const nextCell = cell + 1n;
				const nextByte =
					loaded !== null &&
					nextCell >= loaded.base &&
					nextCell < loaded.base + BigInt(loaded.size)
						? loaded.bytes[Number(nextCell - loaded.base)]
						: null;
				if (nextByte !== null) {
					setEditing(nextCell);
					setEditValue(hexByte(nextByte));
				}
			});
		}
	};

	return {
		editMode,
		setEditMode,
		editing,
		editValue,
		setEditValue,
		beginEdit,
		cancelEdit: () => {
			setEditing(null);
			setEditValue("");
		},
		commitEdit,
		onSelect: select,
		rangeAnchor: range.rangeAnchor,
		rangeStart: range.rangeStart,
		rangeFinish: range.rangeFinish,
		rangeLabel: range.rangeLabel,
		rangeSize: range.rangeSize,
		rangeInput: range.rangeInput,
		setRangeInput: range.setRangeInput,
		onEditChange: handleEditChange,
		onEditKeyDown: handleEditKeyDown,
		onBeginEdit: beginEdit,
		onRangeStart: startRange,
		onRangeExtend: extendRange,
	};
}
