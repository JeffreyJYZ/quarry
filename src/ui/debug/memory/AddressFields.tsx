import { ROW_WIDTHS } from "@/lib/debug/memory/hex";
import { PAGE_SIZES } from "@/ui/debug/memory/parts";

/**
 * The address, row width, page size and Read control at the top of the hex pane. The field takes
 * `0x…`, bare hex, or any expression the debugger can evaluate (`&count`, `head->next`); whatever
 * it cannot resolve is reported by the pane below the bar.
 */
export default function AddressFields({
	input,
	onInputChange,
	onRead,
	rowWidth,
	onRowWidthChange,
	pageSize,
	onPageSizeChange,
	busy,
}: {
	input: string;
	onInputChange: (value: string) => void;
	onRead: () => void;
	rowWidth: number;
	onRowWidthChange: (value: number) => void;
	pageSize: number;
	onPageSizeChange: (value: number) => void;
	busy: boolean;
}) {
	return (
		<>
			<label className="memory-field">
				<span className="memory-label">Go to</span>
				<input
					className="memory-input"
					value={input}
					spellCheck={false}
					autoComplete="off"
					placeholder="0x1f00, &var or an expression"
					aria-label="Go to address or expression"
					onChange={(event) => onInputChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							onRead();
						}
					}}
				/>
			</label>
			<label className="memory-field memory-field-narrow">
				<span className="memory-label">Row</span>
				<select
					className="memory-select"
					value={String(rowWidth)}
					aria-label="Bytes per row"
					onChange={(event) => onRowWidthChange(Number(event.target.value))}
				>
					{ROW_WIDTHS.map((width) => (
						<option key={width} value={String(width)}>
							{width}
						</option>
					))}
				</select>
			</label>
			<button type="button" className="button" onClick={onRead}>
				Read
			</button>
			<label className="memory-field memory-field-narrow">
				<span className="memory-label">Page</span>
				<select
					className="memory-select"
					value={String(pageSize)}
					aria-label="Page size"
					onChange={(event) => onPageSizeChange(Number(event.target.value))}
				>
					{PAGE_SIZES.map((size) => (
						<option key={size} value={String(size)}>
							{size}
						</option>
					))}
				</select>
			</label>
			{busy && <span className="memory-muted memory-head-note">reading</span>}
		</>
	);
}
