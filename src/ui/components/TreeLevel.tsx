import type { FileEntry, GitStatusEntry } from "@/lib/project/api";
import type { DirState, EditState } from "./FileTreeTypes";
import { indent } from "./FileTreeIcons";
import { CreateInputRow } from "./TreeCreateInput";
import { TreeRow } from "./TreeRow";
export type TreeLevelProps = {
	path: string;
	depth: number;
	dirs: Record<string, DirState>;
	expanded: Set<string>;
	activePath: string | null;
	highlightedPath: string | null;
	onToggle: (path: string) => void;
	onRetry: (path: string) => void;
	onOpenFile: (entry: FileEntry) => void;
	onMenu: (entry: FileEntry, x: number, y: number) => void;
	onCommitEdit: (parent: string, name: string, kind: EditState["kind"]) => void;
	onCancelEdit: () => void;
	editing: EditState | null;
	deleteConfirm: string | null;
	onConfirmDelete: (path: string) => void;
	onCancelDelete: () => void;
	changes: Record<string, GitStatusEntry["status"]>;
};
export function TreeLevel({
	path,
	depth,
	dirs,
	expanded,
	activePath,
	highlightedPath,
	onToggle,
	onRetry,
	onOpenFile,
	onMenu,
	onCommitEdit,
	onCancelEdit,
	editing,
	deleteConfirm,
	onConfirmDelete,
	onCancelDelete,
	changes,
}: TreeLevelProps) {
	const state = dirs[path];
	const noteStyle = indent(depth + 1);
	if (!state || state.status === "loading") {
		return (
			<p className="tree-note" style={noteStyle}>
				loading...
			</p>
		);
	}
	if (state.status === "error") {
		return (
			<button
				type="button"
				className="tree-note error"
				style={noteStyle}
				title={state.message}
				onClick={() => onRetry(path)}
			>
				{state.message} (retry)
			</button>
		);
	}
	if (
		state.entries.length === 0 &&
		!(editing !== null && "parent" in editing && editing.parent === path)
	) {
		return (
			<p className="tree-note" style={noteStyle}>
				empty
			</p>
		);
	}
	const changedDirs = new Set<string>();
	for (const p of Object.keys(changes)) {
		for (let cur = p; ;) {
			changedDirs.add(cur);
			const i = cur.lastIndexOf("/");
			if (i <= 0) break;
			cur = cur.slice(0, i);
		}
	}
	const showCreateInput =
		editing?.kind.startsWith("create") === true &&
		editing !== null &&
		"parent" in editing &&
		editing.parent === path;

	return (
		<ul className="tree">
			{state.entries.map((entry) => {
				const isOpen = entry.isDir && expanded.has(entry.path);
				const status = changes[entry.path];
				const isRenaming =
					editing !== null && editing.kind === "rename" && editing.target === entry.path;
				const isDeleting = deleteConfirm === entry.path;
				return (
					<li key={entry.path}>
						{isRenaming ? (
							<div className="tree-row edit-row" style={indent(depth)}>
								<input
									className="tree-input"
									ref={(node) => node?.focus()}
									defaultValue={entry.name}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											const value = (
												event.target as HTMLInputElement
											).value.trim();
											onCommitEdit(entry.path, value, "rename");
										} else if (event.key === "Escape") {
											onCancelEdit();
										}
									}}
									onBlur={() => onCancelEdit()}
								/>
							</div>
						) : isDeleting ? (
							<div className="tree-row delete-row" style={indent(depth)}>
								<span className="tree-name">delete {entry.name}?</span>
								<button type="button" onClick={() => onConfirmDelete(entry.path)}>
									delete
								</button>
								<button type="button" onClick={onCancelDelete}>
									cancel
								</button>
							</div>
						) : (
							<TreeRow
								entry={entry}
								depth={depth}
								isOpen={isOpen}
								status={status}
								activePath={activePath}
								highlightedPath={highlightedPath}
								hasChangeUnder={changedDirs.has(entry.path)}
								onToggle={onToggle}
								onOpenFile={onOpenFile}
								onMenu={onMenu}
							/>
						)}
						{isOpen ? (
							<TreeLevel
								path={entry.path}
								depth={depth + 1}
								dirs={dirs}
								expanded={expanded}
								activePath={activePath}
								highlightedPath={highlightedPath}
								onToggle={onToggle}
								onRetry={onRetry}
								onOpenFile={onOpenFile}
								onMenu={onMenu}
								onCommitEdit={onCommitEdit}
								onCancelEdit={onCancelEdit}
								editing={editing}
								deleteConfirm={deleteConfirm}
								onConfirmDelete={onConfirmDelete}
								onCancelDelete={onCancelDelete}
								changes={changes}
							/>
						) : null}
						{entry.isDir &&
						isOpen &&
						showCreateInput &&
						editing !== null &&
						"parent" in editing &&
						editing.parent === entry.path ? (
							<CreateInputRow
								depth={depth + 1}
								parent={entry.path}
								kind={editing.kind}
								onCommit={onCommitEdit}
								onCancel={onCancelEdit}
							/>
						) : null}
					</li>
				);
			})}
			{showCreateInput &&
			editing !== null &&
			"parent" in editing &&
			editing.parent === path &&
			state.entries.length === 0 ? (
				<li>
					<CreateInputRow
						depth={depth}
						parent={path}
						kind={editing.kind}
						onCommit={onCommitEdit}
						onCancel={onCancelEdit}
					/>
				</li>
			) : null}
		</ul>
	);
}
