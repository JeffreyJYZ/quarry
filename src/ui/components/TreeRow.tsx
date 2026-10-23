import type { FileEntry, GitStatusEntry } from "@/lib/project/api";
import { FolderIcon, PencilIcon, indent } from "./FileTreeIcons";

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
	onAction: (entry: FileEntry, action: "new-file" | "new-folder" | "rename" | "delete") => void;
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
	onAction,
}: TreeRowProps) {
	return (
		<div className="tree-row-wrap">
			{entry.isDir ? (
				<button
					type="button"
					className={isOpen ? "tree-row dir expanded" : "tree-row dir"}
					style={indent(depth)}
					aria-expanded={isOpen}
					title={entry.path}
					onClick={() => onToggle(entry.path)}
				>
					<span className="caret" aria-hidden="true" />
					<span className="tree-name">{entry.name}</span>
					<span className="tree-badge-slot">
						{hasChangeUnder ? (
							<span className="tree-dir-dot" aria-hidden="true" />
						) : null}
					</span>
				</button>
			) : (
				<button
					type="button"
					data-path={entry.path}
					className={
						entry.path === activePath
							? "tree-row file active"
							: entry.path === highlightedPath
								? "tree-row file revealed"
								: "tree-row file"
					}
					style={indent(depth)}
					title={entry.path}
					onClick={() => onOpenFile(entry)}
				>
					<span className="spacer" aria-hidden="true" />
					<span className="tree-name">{entry.name}</span>
					<span className="tree-badge-slot">{badgeFor(status) ?? null}</span>
				</button>
			)}
			<span className="tree-actions">
				{entry.isDir ? (
					<>
						<button
							type="button"
							title="New file"
							onClick={() => onAction(entry, "new-file")}
						>
							+
						</button>
						<button
							type="button"
							title="New folder"
							aria-label="New folder"
							onClick={() => onAction(entry, "new-folder")}
						>
							<FolderIcon />
						</button>
					</>
				) : null}
				<button
					type="button"
					title="Rename"
					aria-label="Rename"
					onClick={() => onAction(entry, "rename")}
				>
					<PencilIcon />
				</button>
				<button type="button" title="Delete" onClick={() => onAction(entry, "delete")}>
					×
				</button>
			</span>
		</div>
	);
}
