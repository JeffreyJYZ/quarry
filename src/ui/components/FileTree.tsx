import { useState } from "react";
import type { FileEntry } from "@/lib/project/api";
import { TreeLevel } from "./TreeLevel";
import TreeContextMenu from "./TreeContextMenu";
import { useFileTree, type FileTreeProps } from "./useFileTree";

export type { FileTreeProps } from "./useFileTree";
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

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the container is only a drop target for a right click
		<div
			className="tree-scroll"
			onContextMenu={(event) => {
				// A right click on the empty space below the tree acts on the project root.
				if (event.target !== event.currentTarget) return;
				event.preventDefault();
				setMenu({
					entry: { path: root, name: root.split("/").pop() ?? root, isDir: true },
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
					onClose={() => setMenu(null)}
				/>
			)}
		</div>
	);
}
