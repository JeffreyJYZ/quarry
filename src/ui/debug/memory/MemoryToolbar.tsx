import AddressFields from "@/ui/debug/memory/AddressFields";

/** The bar above the hex table: address/row width/Read, then copy, history and edit toggles. */
export default function MemoryToolbar({
	input,
	onInputChange,
	onCommit,
	rowWidth,
	onRowWidthChange,
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
	rowWidth: number;
	onRowWidthChange: (value: number) => void;
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
			<AddressFields
				input={input}
				onInputChange={onInputChange}
				onRead={onCommit}
				rowWidth={rowWidth}
				onRowWidthChange={onRowWidthChange}
				pageSize={pageSize}
				onPageSizeChange={onSizeChange}
				busy={busy}
			/>
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
				Follow frame
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
		</div>
	);
}
