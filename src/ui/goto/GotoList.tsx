import type { Row } from "./gotoModel";

/** The result list: rows, the empty line, and the active-row highlight. */
export default function GotoList({
	rows,
	active,
	loading,
	listRef,
	onHover,
	onPick,
}: {
	rows: Row[];
	active: number;
	loading: boolean;
	listRef: React.RefObject<HTMLUListElement | null>;
	onHover: (index: number) => void;
	onPick: (row: Row) => void;
}) {
	return (
		<ul className="goto-list" ref={listRef}>
			{rows.length === 0 ? (
				<li className="goto-empty">{loading ? "Searching…" : "Nothing matches"}</li>
			) : (
				rows.map((row, index) => (
					<li key={row.key}>
						<button
							type="button"
							className={index === active ? "goto-row active" : "goto-row"}
							onMouseEnter={() => onHover(index)}
							onClick={() => onPick(row)}
						>
							<span className="goto-label">{row.label}</span>
							<span className="goto-detail">{row.detail}</span>
						</button>
					</li>
				))
			)}
		</ul>
	);
}
