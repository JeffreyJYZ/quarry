import type { FileEntry } from "@/lib/project/api";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export type TreeAction = "new-file" | "new-folder" | "rename" | "delete";

/**
 * The file tree's right-click menu.
 *
 * These actions used to be four icon buttons on every row; the row is quieter now, and the same
 * actions sit here for whichever entry was clicked.
 */
export default function TreeContextMenu({
	entry,
	x,
	y,
	onOpen,
	onSelect,
	onClose,
}: {
	entry: FileEntry;
	x: number;
	y: number;
	onOpen: (entry: FileEntry) => void;
	onSelect: (entry: FileEntry, action: TreeAction) => void;
	onClose: () => void;
}) {
	const items: MenuItem[] = [];
	if (!entry.isDir) {
		items.push({ label: "Open", onSelect: () => onOpen(entry) });
	}
	if (entry.isDir) {
		items.push(
			{ label: "New file", onSelect: () => onSelect(entry, "new-file") },
			{ label: "New folder", onSelect: () => onSelect(entry, "new-folder") },
		);
	}
	items.push({
		label: "Rename",
		separated: items.length > 0,
		onSelect: () => onSelect(entry, "rename"),
	});
	items.push({ label: "Delete", danger: true, onSelect: () => onSelect(entry, "delete") });

	return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
