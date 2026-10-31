export function ProblemsHead({
	errors,
	warnings,
	other,
	allowed,
	groupByFile,
	textFilter,
	onToggle,
	onToggleSeverity,
	onChooseGrouping,
	onChangeTextFilter,
}: {
	errors: number;
	warnings: number;
	other: number;
	allowed: ReadonlySet<number>;
	groupByFile: boolean;
	textFilter: string;
	onToggle: () => void;
	onToggleSeverity: (severities: number[]) => void;
	onChooseGrouping: (grouped: boolean) => void;
	onChangeTextFilter: (value: string) => void;
}) {
	return (
		<div className="problems-head">
			<button
				type="button"
				className="problems-head-toggle"
				onClick={onToggle}
				aria-expanded={true}
			>
				<span className="problems-caret open" aria-hidden="true" />
				<span className="problems-title">Problems</span>
			</button>
			<input
				type="search"
				className="problems-text-filter"
				value={textFilter}
				onChange={(event) => onChangeTextFilter(event.target.value)}
				placeholder="filter"
				aria-label="Filter problems"
			/>
			<span className="problems-counts">
				<button
					type="button"
					className={
						allowed.has(1) ? "problems-filter-option active" : "problems-filter-option"
					}
					aria-pressed={allowed.has(1)}
					onClick={(event) => {
						event.stopPropagation();
						onToggleSeverity([1]);
					}}
				>
					{errors} errors
				</button>
				<span className="sep">·</span>
				<button
					type="button"
					className={
						allowed.has(2) ? "problems-filter-option active" : "problems-filter-option"
					}
					aria-pressed={allowed.has(2)}
					onClick={(event) => {
						event.stopPropagation();
						onToggleSeverity([2]);
					}}
				>
					{warnings} warnings
				</button>
				{other > 0 ? (
					<>
						<span className="sep">·</span>
						<button
							type="button"
							className={
								allowed.has(3) || allowed.has(4)
									? "problems-filter-option active"
									: "problems-filter-option"
							}
							aria-pressed={allowed.has(3) || allowed.has(4)}
							onClick={(event) => {
								event.stopPropagation();
								onToggleSeverity([3, 4]);
							}}
						>
							{other} info
						</button>
					</>
				) : null}
				<span className="sep">·</span>
				<button
					type="button"
					className={
						groupByFile ? "problems-filter-option active" : "problems-filter-option"
					}
					aria-pressed={groupByFile}
					onClick={(event) => {
						event.stopPropagation();
						onChooseGrouping(!groupByFile);
					}}
				>
					group by file
				</button>
			</span>
		</div>
	);
}
