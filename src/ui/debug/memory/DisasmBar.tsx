/** Instruction counts the disassembly pane offers. */
export const DISASM_COUNTS = [16, 64, 128];

/** The disassembly bar: its own address field, the instruction count, refresh and copy. */
export default function DisasmBar({
	input,
	onInputChange,
	onGo,
	count,
	onCountChange,
	onRefresh,
	onCopy,
	copied,
	canCopy,
	busy,
}: {
	input: string;
	onInputChange: (value: string) => void;
	onGo: () => void;
	count: number;
	onCountChange: (value: number) => void;
	onRefresh: () => void;
	onCopy: () => void;
	copied: boolean;
	canCopy: boolean;
	busy: boolean;
}) {
	return (
		<div className="memory-head">
			<span className="memory-title">disassembly</span>
			<label className="memory-field">
				<span className="memory-label">Go to</span>
				<input
					className="memory-input"
					value={input}
					spellCheck={false}
					autoComplete="off"
					placeholder="0x1f00, &func or an expression"
					aria-label="Disassembly address or expression"
					onChange={(event) => onInputChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							onGo();
						}
					}}
				/>
			</label>
			<button type="button" className="button" onClick={onGo}>
				Go
			</button>
			<label className="memory-field memory-field-narrow">
				<span className="memory-label">Count</span>
				<select
					className="memory-select"
					value={String(count)}
					aria-label="Instruction count"
					onChange={(event) => onCountChange(Number(event.target.value))}
				>
					{DISASM_COUNTS.map((value) => (
						<option key={value} value={String(value)}>
							{value}
						</option>
					))}
				</select>
			</label>
			<button type="button" className="button" onClick={onRefresh}>
				Refresh
			</button>
			<button
				type="button"
				className={copied ? "button active" : "button"}
				disabled={!canCopy}
				onClick={onCopy}
			>
				{copied ? "Copied" : "Copy"}
			</button>
			{busy && <span className="memory-muted memory-head-note">loading</span>}
		</div>
	);
}
