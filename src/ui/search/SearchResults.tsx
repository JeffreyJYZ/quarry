import type { RefObject } from "react";
import { clipLine, type SearchGroup } from "@/lib/search/model";

export function SearchResults({
	groups,
	active,
	onActive,
	onOpen,
	listRef,
}: {
	groups: SearchGroup[];
	active: number;
	onActive: (index: number) => void;
	onOpen: (path: string) => void;
	listRef: RefObject<HTMLDivElement | null>;
}) {
	return (
		<div className="search-results" ref={listRef}>
			{groups.map((group) => (
				<div className="search-group" key={group.path}>
					<div className="search-file" title={group.path}>
						<span className="search-file-name">{group.name}</span>
						<span className="search-file-dir">{group.dir}</span>
						<span className="search-file-count">{group.rows.length}</span>
					</div>
					{group.rows.map((row) => (
						<button
							type="button"
							key={`${row.match.path}:${row.match.line}:${row.match.column}:${row.index}`}
							className={row.index === active ? "search-row active" : "search-row"}
							data-index={row.index}
							title={`${row.match.path}:${row.match.line}:${row.match.column}`}
							onClick={() => onOpen(row.match.path)}
							onMouseEnter={() => onActive(row.index)}
						>
							<span className="search-pos">
								{row.match.line}:{row.match.column}
							</span>
							<span className="search-text">{clipLine(row.match.text)}</span>
						</button>
					))}
				</div>
			))}
		</div>
	);
}
