import type { FileEntry, GitStatusEntry } from "@/lib/project/api";
import { FolderIcon, indent } from "./FileTreeIcons";
import FileTypeIcon from "./FileTypeIcon";

export type TreeRowProps = {
	entry: FileEntry;
	depth: number;
	isOpen: boolean;
	status: GitStatusEntry["status"] | undefined;
	activePath: string | null;
	highlightedPath: string | null;
	hasChangeUnder: boolean;
	onToggle: (path: string) => void;
	onOpenFile: (entry: FileEntry) => void;
	onMenu: (entry: FileEntry, x: number, y: number) => void;
};

export function badgeFor(status: GitStatusEntry["status"] | undefined) {
	if (status === undefined) return null;
	const letter =
		status === "modified"
			? "M"
			: status === "added"
				? "A"
				: status === "deleted"
					? "D"
					: status === "renamed"
						? "R"
						: status === "untracked"
							? "?"
							: "!";
	const cls =
		status === "modified"
			? "tree-badge modified"
			: status === "added"
				? "tree-badge added"
				: status === "deleted"
					? "tree-badge deleted"
					: status === "renamed"
						? "tree-badge renamed"
						: status === "untracked"
							? "tree-badge untracked"
							: "tree-badge conflicted";
	return <span className={cls}>{letter}</span>;
}

export function TreeRow({
	entry,
	depth,
	isOpen,
	status,
	activePath,
	highlightedPath,
	hasChangeUnder,
	onToggle,
	onOpenFile,
	onMenu,
}: TreeRowProps) {
	/** Right click and the keyboard's menu key both open the row's menu at the row's edge. */
	const openMenuFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
		event.preventDefault();
		const box = event.currentTarget.getBoundingClientRect();
		onMenu(entry, box.left + 12, box.bottom - 4);
	};

	const className = entry.isDir
		? isOpen
			? "tree-row dir expanded"
			: "tree-row dir"
		: entry.path === activePath
			? "tree-row file active"
			: entry.path === highlightedPath
				? "tree-row file revealed"
				: "tree-row file";

	return (
		<div className="tree-row-wrap">
			<button
				type="button"
				data-path={entry.path}
				className={className}
				style={indent(depth)}
				title={entry.path}
				aria-expanded={entry.isDir ? isOpen : undefined}
				onClick={() => (entry.isDir ? onToggle(entry.path) : onOpenFile(entry))}
				onContextMenu={(event) => {
					event.preventDefault();
					onMenu(entry, event.clientX, event.clientY);
				}}
				onKeyDown={openMenuFromKeyboard}
			>
				<span className="tree-caret-slot">
					{entry.isDir ? <span className="caret" aria-hidden="true" /> : null}
				</span>
				<span className={entry.isDir && isOpen ? "tree-glyph open" : "tree-glyph"}>
					{entry.isDir ? <FolderIcon /> : <FileTypeIcon name={entry.name} />}
				</span>
				<span className="tree-name">{entry.name}</span>
				<span className="tree-badge-slot">
					{hasChangeUnder ? <span className="tree-dir-dot" aria-hidden="true" /> : null}
					{badgeFor(status)}
				</span>
			</button>
		</div>
	);
}
