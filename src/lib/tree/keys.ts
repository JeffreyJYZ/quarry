/** Visible rows of the explorer, in the order they are painted: across every nesting level. */
export type FlatRow = {
	path: string;
	name: string;
	isDir: boolean;
	depth: number;
};

type EntryLike = { path: string; name: string; isDir: boolean };

/**
 * Flatten the visible tree.
 *
 * Keyboard movement is a single list, not one list per directory: ArrowDown from the last child of
 * an expanded folder continues into the next row at the parent's level. Children only appear under
 * an expanded directory, and a directory that is still loading has no rows yet.
 */
export function flattenRows(
	entriesOf: (dir: string) => readonly EntryLike[] | undefined,
	expanded: ReadonlySet<string>,
	root: string,
): FlatRow[] {
	const rows: FlatRow[] = [];
	const visit = (dir: string, depth: number): void => {
		const entries = entriesOf(dir);
		if (entries === undefined) return;
		for (const entry of entries) {
			rows.push({ path: entry.path, name: entry.name, isDir: entry.isDir, depth });
			if (entry.isDir && expanded.has(entry.path)) visit(entry.path, depth + 1);
		}
	};
	visit(root, 0);
	return rows;
}

export type TreeCommand =
	| { kind: "move"; delta: -1 | 1 }
	| { kind: "expand" }
	| { kind: "collapse" }
	| { kind: "activate" }
	| { kind: "rename" }
	| { kind: "delete" };

/**
 * Which tree command a key press means, if any.
 *
 * ContextMenu and Shift+F10 are deliberately absent: the row's own handler opens its menu, and a
 * second path here would open it twice. Enter and the space bar are explicit instead of leaning on
 * the native button click, because the row carries the treeitem role and the handler cancels the
 * default activation to keep it single.
 */
export function keyCommand(event: { key: string; shiftKey?: boolean }): TreeCommand | null {
	switch (event.key) {
		case "ArrowDown":
			return { kind: "move", delta: 1 };
		case "ArrowUp":
			return { kind: "move", delta: -1 };
		case "ArrowRight":
			return { kind: "expand" };
		case "ArrowLeft":
			return { kind: "collapse" };
		case "Enter":
		case " ":
			return { kind: "activate" };
		case "F2":
			return { kind: "rename" };
		case "Delete":
		case "Backspace":
			return { kind: "delete" };
		default:
			return null;
	}
}

/** Clamp an index into a row list; an empty list has no row, so -1. */
export function clampIndex(index: number, length: number): number {
	if (length <= 0) return -1;
	return Math.max(0, Math.min(index, length - 1));
}

/** The row a vertical move lands on: never past either end. */
export function moveIndex(current: number, delta: number, length: number): number {
	return clampIndex(current + delta, length);
}

/** The first child of the row at `index`, when it is an expanded directory with visible children. */
export function firstChildIndex(rows: readonly FlatRow[], index: number): number | null {
	const row = rows[index];
	const next = rows[index + 1];
	if (row === undefined || next === undefined) return null;
	return next.depth === row.depth + 1 ? index + 1 : null;
}

/** The row one level up: the nearest earlier row shallower than this one. */
export function parentIndex(rows: readonly FlatRow[], index: number): number | null {
	const row = rows[index];
	if (row === undefined) return null;
	for (let i = index - 1; i >= 0; i -= 1) {
		const candidate = rows[i];
		if (candidate !== undefined && candidate.depth < row.depth) return i;
	}
	return null;
}

/** A DOM id for a row, stable across re-renders and legal for `aria-activedescendant`. */
export function rowDomId(path: string): string {
	return `tree-row-${encodeURIComponent(path)}`;
}
