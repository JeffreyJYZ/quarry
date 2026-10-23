import { formatAddress, hexByte } from "@/lib/debug/memory/hex";

export type MemoryCellApi = {
	editing: bigint | null;
	editValue: string;
	selected: bigint | null;
	rangeStart: bigint | null;
	rangeFinish: bigint | null;
	onEditChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onEditKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, cell: bigint) => void;
	onSelect: (cell: bigint, shiftKey: boolean) => void;
	onBeginEdit: (cell: bigint, byte: number | null) => void;
	commitEdit: (cell: bigint) => Promise<void>;
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
			onClick={(event) => api.onSelect(cell, event.shiftKey)}
			onDoubleClick={() => api.onBeginEdit(cell, byte)}
		>
			{hexByte(byte)}
		</button>
	);
}
