import { memo, type ReactNode } from "react";
import { matchPositions } from "@/lib/quickopen/rank";
import { highlight } from "./Highlight";
import { fileParts } from "./parts";

export const QuickOpenRow = memo(function QuickOpenRow({
	path,
	root,
	index,
	active,
	isOpen,
	query,
	onSelect,
	onHover,
}: {
	path: string;
	root: string;
	index: number;
	active: boolean;
	isOpen: boolean;
	query?: string;
	/** The row passes its own path, so one handler serves every row. */
	onSelect: (path: string) => void;
	/** The row passes its own index, so one handler serves every row. */
	onHover: (index: number) => void;
}) {
	const { name, relDir } = fileParts(path, root);
	let nameNode: ReactNode = name;
	let dirNode: ReactNode = relDir;
	if (query !== undefined) {
		nameNode = highlight(name, matchPositions(name, query) ?? []);
		dirNode = highlight(relDir, matchPositions(relDir, query) ?? []);
	}
	return (
		<button
			type="button"
			className={active ? "quick-open-row active" : "quick-open-row"}
			data-index={index}
			title={path}
			onClick={() => onSelect(path)}
			onMouseEnter={() => onHover(index)}
		>
			{isOpen ? <span className="quick-open-dot">•</span> : null}
			<span className="search-file-name">{nameNode}</span>
			<span className="search-file-dir">{dirNode}</span>
		</button>
	);
});
