import type { ReactNode } from "react";
import { matchPositions } from "@/lib/quickopen/rank";
import { highlight } from "./Highlight";
import { fileParts } from "./parts";

export function QuickOpenRow({
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
	onSelect: () => void;
	onHover: () => void;
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
			className={active ? "search-row active" : "search-row"}
			data-index={index}
			title={path}
			onClick={onSelect}
			onMouseEnter={onHover}
		>
			{isOpen ? <span className="quick-open-dot">•</span> : null}
			<span className="search-file-name">{nameNode}</span>
			<span className="search-file-dir">{dirNode}</span>
		</button>
	);
}
