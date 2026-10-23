import { PAGE_SIZES } from "@/ui/debug/memory/parts";

/** The address/page-size bar and the navigation/edit toggles above the hex table. */
export default function MemoryToolbar({
	input,
	onInputChange,
	onCommit,
	pageSize,
	onSizeChange,
	onCopy,
	canGoBack,
	onBack,
	canGoForward,
	onForward,
	followed,
	onToggleFollow,
	address,
	editMode,
	onToggleEdit,
	rangeLabel,
	rangeInput,
	busy,
}: {
	input: string;
	onInputChange: (value: string) => void;
	onCommit: () => void;
	pageSize: number;
	onSizeChange: (size: number) => void;
	onCopy: () => void;
	canGoBack: boolean;
	onBack: () => void;
	canGoForward: boolean;
	onForward: () => void;
	followed: boolean;
	onToggleFollow: () => void;
	address: string | null;
	editMode: boolean;
	onToggleEdit: () => void;
	rangeLabel: string | null;
	rangeInput: string;
	busy: boolean;
}) {
	return (
		<div className="memory-head">
			<label className="memory-field">
				<span className="memory-label">Address</span>
				<input
					className="memory-input"
					value={input}
					spellCheck={false}
					autoComplete="off"
					placeholder="0x…"
					aria-label="Start address"
					onChange={(event) => {
						onInputChange(event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							onCommit();
						}
					}}
				/>
			</label>
			<label className="memory-field memory-field-narrow">
				<span className="memory-label">Bytes</span>
				<select
					className="memory-select"
					value={String(pageSize)}
					aria-label="Page size"
					onChange={(event) => onSizeChange(Number(event.target.value))}
				>
					{PAGE_SIZES.map((size) => (
						<option key={size} value={String(size)}>
							{size}
						</option>
					))}
				</select>
			</label>
			<button type="button" className="button" onClick={onCommit}>
				Refresh
			</button>
			<button type="button" className="button" onClick={onCopy}>
				Copy
			</button>
			<button type="button" className="button" disabled={!canGoBack} onClick={onBack}>
				Back
			</button>
			<button type="button" className="button" disabled={!canGoForward} onClick={onForward}>
				Forward
			</button>
			<button
				type="button"
				className={followed ? "button active" : "button"}
				aria-pressed={followed}
				disabled={address === null}
				onClick={onToggleFollow}
			>
				Follow pointer
			</button>
			<button
				type="button"
				className={editMode ? "button active" : "button"}
				aria-pressed={editMode}
				onClick={onToggleEdit}
			>
				Edit
			</button>
			{rangeLabel !== null && (
				<span className="memory-muted memory-head-note">
					{rangeLabel}
					{rangeInput !== "" ? ` ${rangeInput}` : ""}
				</span>
			)}
			{busy && <span className="memory-muted memory-head-note">reading</span>}
		</div>
	);
}
