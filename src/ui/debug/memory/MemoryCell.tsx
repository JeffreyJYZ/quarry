import { useRef } from "react";
import { formatAddress, hexByte } from "@/lib/debug/memory/hex";

export type MemoryCellApi = {
	editing: bigint | null;
	editValue: string;
	selected: bigint | null;
	rangeAnchor: bigint | null;
	rangeStart: bigint | null;
	rangeFinish: bigint | null;
	onEditChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onEditKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, cell: bigint) => void;
	onSelect: (cell: bigint, shiftKey: boolean) => void;
	onBeginEdit: (cell: bigint, byte: number | null) => void;
	commitEdit: (cell: bigint) => Promise<void>;
	onRangeStart: (cell: bigint) => void;
	onRangeExtend: (cell: bigint) => void;
};

/** One hex byte cell: either an inline edit input or a selectable button. */
export default function MemoryCell({
	cell,
	byte,
	api,
}: {
	cell: bigint;
	byte: number | null;
	api: MemoryCellApi;
}) {
	const current = api.selected === cell;
	const inRange =
		api.rangeStart !== null &&
		api.rangeFinish !== null &&
		cell >= api.rangeStart &&
		cell <= api.rangeFinish;

	const downRef = useRef(false);
	const movedRef = useRef(false);

	if (api.editing === cell) {
		return (
			<input
				key={cell.toString(16)}
				className="memory-cell memory-cell-edit"
				value={api.editValue}
				spellCheck={false}
				autoComplete="off"
				maxLength={2}
				aria-label={formatAddress(cell)}
				onChange={api.onEditChange}
				onKeyDown={(event) => api.onEditKeyDown(event, cell)}
			/>
		);
	}

	return (
		<button
			type="button"
			className={current || inRange ? "memory-cell selected" : "memory-cell"}
			key={cell.toString(16)}
			aria-label={formatAddress(cell)}
			onMouseDown={(event) => {
				downRef.current = true;
				movedRef.current = false;
				if (event.shiftKey) {
					if (api.rangeAnchor === null) {
						api.onRangeStart(cell);
					} else {
						api.onRangeExtend(cell);
					}
				} else {
					api.onRangeStart(cell);
				}
			}}
			onMouseEnter={() => {
				if (downRef.current) {
					movedRef.current = true;
					api.onRangeExtend(cell);
				}
			}}
			onMouseUp={() => {
				downRef.current = false;
			}}
			onClick={(event) => {
				if (movedRef.current) {
					movedRef.current = false;
					return;
				}
				api.onSelect(cell, event.shiftKey);
			}}
			onDoubleClick={() => api.onBeginEdit(cell, byte)}
		>
			{hexByte(byte)}
		</button>
	);
}
