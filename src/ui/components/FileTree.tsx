import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "@/lib/project/api";
import { fileName } from "@/lib/project/paths";
import { dirsWithChanges } from "@/lib/tree/changed";
import {
	firstChildIndex,
	flattenRows,
	keyCommand,
	moveIndex,
	parentIndex,
	rowDomId,
} from "@/lib/tree/keys";
import { TreeLevel } from "./TreeLevel";
import TreeContextMenu from "./TreeContextMenu";
import { useFileTree } from "./useFileTree";
import type { FileTreeProps } from "./FileTreeTypes";

export type { FileTreeProps } from "./FileTreeTypes";
export type { DirState, EditState } from "./FileTreeTypes";

type OpenMenu = { entry: FileEntry; x: number; y: number } | null;

export default function FileTree(props: FileTreeProps) {
	const {
		changeMap,
		dirs,
		expanded,
		highlightedPath,
		editing,
		deleteConfirm,
		load,
		toggle,
		openFile,
		handleAction,
		commitEdit,
		confirmDelete,
		setEditing,
		setDeleteConfirm,
	} = useFileTree(props);

	const { root, activePath } = props;
	const [menu, setMenu] = useState<OpenMenu>(null);
	const [selectedPath, setSelectedPath] = useState<string | null>(activePath);
	const treeRef = useRef<HTMLDivElement>(null);

	const rows = flattenRows(
		(path) => {
			const state = dirs[path];
			return state?.status === "ready" ? state.entries : undefined;
		},
		expanded,
		root,
	);
	const found = selectedPath === null ? -1 : rows.findIndex((row) => row.path === selectedPath);
	const activeIndex = found >= 0 ? found : rows.length > 0 ? 0 : -1;
	const active = activeIndex >= 0 ? rows[activeIndex] : undefined;
	const changedDirs = dirsWithChanges(changeMap);

	// The keyboard selection follows the file the editor shows, so the tree keeps one tab stop even
	// when a file was opened from quick open, goto or the outline.
	useEffect(() => {
		if (activePath !== null) setSelectedPath(activePath);
	}, [activePath]);

	const focusRow = (path: string) => {
		setSelectedPath(path);
		const node = treeRef.current?.querySelector<HTMLElement>(
			`[data-path="${CSS.escape(path)}"]`,
		);
		node?.focus();
	};

	/** One delegated handler: every key acts on the row that currently owns the tab stop. */
	const onTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (!(event.target instanceof HTMLElement)) return;
		// The rename field and the delete confirmation own their keys.
		if (event.target.dataset.path === undefined) return;
		const command = keyCommand({ key: event.key, shiftKey: event.shiftKey });
		if (command === null) return;
		event.preventDefault();
		if (active === undefined) return;
		const entry: FileEntry = { path: active.path, name: active.name, isDir: active.isDir };
		if (command.kind === "move") {
			const target = rows[moveIndex(activeIndex, command.delta, rows.length)];
			if (target !== undefined) focusRow(target.path);
		} else if (command.kind === "expand") {
			if (!active.isDir) return;
			if (!expanded.has(active.path)) {
				toggle(active.path);
				return;
			}
			const child = firstChildIndex(rows, activeIndex);
			const target = child === null ? undefined : rows[child];
			if (target !== undefined) focusRow(target.path);
		} else if (command.kind === "collapse") {
			if (active.isDir && expanded.has(active.path)) {
				toggle(active.path);
				return;
			}
			const parent = parentIndex(rows, activeIndex);
			const target = parent === null ? undefined : rows[parent];
			if (target !== undefined) focusRow(target.path);
		} else if (command.kind === "activate") {
			if (active.isDir) toggle(active.path);
			else openFile(entry);
		} else if (command.kind === "rename") {
			handleAction(entry, "rename");
		} else {
			handleAction(entry, "delete");
		}
	};

	return (
		<div
			className="tree-scroll"
			ref={treeRef}
			role="tree"
			aria-label="Explorer"
			tabIndex={-1}
			aria-activedescendant={active === undefined ? undefined : rowDomId(active.path)}
			onKeyDown={onTreeKeyDown}
			onContextMenu={(event) => {
				// A right click on the empty space below the tree acts on the project root.
				if (event.target !== event.currentTarget) return;
				event.preventDefault();
				setMenu({
					entry: { path: root, name: fileName(root) || root, isDir: true },
					x: event.clientX,
					y: event.clientY,
				});
			}}
		>
			<TreeLevel
				path={root}
				depth={0}
				dirs={dirs}
				expanded={expanded}
				activePath={activePath}
				highlightedPath={highlightedPath}
				selectedPath={active === undefined ? null : active.path}
				changedDirs={changedDirs}
				onRowFocus={setSelectedPath}
				onToggle={toggle}
				onRetry={load}
				onOpenFile={openFile}
				onMenu={(entry, x, y) => setMenu({ entry, x, y })}
				onCommitEdit={commitEdit}
				onCancelEdit={() => setEditing(null)}
				editing={editing}
				deleteConfirm={deleteConfirm}
				onConfirmDelete={confirmDelete}
				onCancelDelete={() => setDeleteConfirm(null)}
				changes={changeMap}
			/>
			{menu === null ? null : (
				<TreeContextMenu
					entry={menu.entry}
					x={menu.x}
					y={menu.y}
					onOpen={openFile}
					onSelect={handleAction}
					onRestartLsp={props.onRestartLsp}
					onClose={() => setMenu(null)}
				/>
			)}
		</div>
	);
}
