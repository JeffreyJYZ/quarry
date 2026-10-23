import { TreeLevel } from "./TreeLevel";
import { useFileTree, type FileTreeProps } from "./useFileTree";

export type { FileTreeProps } from "./useFileTree";
export type { DirState, EditState } from "./FileTreeTypes";

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

	return (
		<div className="tree-scroll">
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
				onAction={handleAction}
				onCommitEdit={commitEdit}
				onCancelEdit={() => setEditing(null)}
				editing={editing}
				deleteConfirm={deleteConfirm}
				onConfirmDelete={confirmDelete}
				onCancelDelete={() => setDeleteConfirm(null)}
				changes={changeMap}
			/>
		</div>
	);
}
