import { invoke } from "@tauri-apps/api/core";

/** One node of a type hierarchy, exactly as `lsp_prepare_type_hierarchy` returns it. */
export type TypeHierarchyNode = {
	name: string;
	/** LSP `SymbolKind`. */
	kind: number;
	/** The server's own URI, handed back unchanged so a follow-up reaches the same item. */
	uri: string;
	path: string;
	line: number;
	character: number;
	detail: string | null;
	children: TypeHierarchyNode[];
	parents: TypeHierarchyNode[];
};

/** The follow-up answer: the item asked about, with the neighbours the server reported. */
export type TypeHierarchyAnswer = { item: TypeHierarchyNode };

/** Which end of the hierarchy a view walks. Both lists arrive in one answer. */
export type TypeHierarchyDirection = "supertypes" | "subtypes";

export type Cursor = { line: number; character: number };

/** `textDocument/prepareTypeHierarchy`: the types at one position, as hierarchy roots. */
export function lspPrepareTypeHierarchy(
	root: string,
	path: string,
	line: number,
	character: number,
): Promise<TypeHierarchyNode[]> {
	return invoke<TypeHierarchyNode[]>("lsp_prepare_type_hierarchy", {
		projectRoot: root,
		path,
		line,
		character,
	});
}

/** One node's neighbours, both directions at once; a view picks the list it renders. */
export function lspTypeHierarchy(
	root: string,
	item: TypeHierarchyNode,
): Promise<TypeHierarchyAnswer> {
	return invoke<TypeHierarchyAnswer>("lsp_type_hierarchy", { projectRoot: root, item });
}

/** The neighbours one direction shows. */
export function neighbourNodes(
	answer: TypeHierarchyAnswer,
	direction: TypeHierarchyDirection,
): TypeHierarchyNode[] {
	return direction === "supertypes" ? answer.item.parents : answer.item.children;
}

/** Stable identity of a node: the server's URI plus its position. */
export function hierarchyKey(node: TypeHierarchyNode): string {
	return `${node.uri}|${node.line}|${node.character}`;
}

/** A node with no file behind it cannot be opened. */
export function isSelectable(node: TypeHierarchyNode): boolean {
	return node.path.startsWith("/");
}

/** What the copy action carries: the server's detail when it has one, else the plain name. */
export function qualifiedName(node: TypeHierarchyNode): string {
	const detail = node.detail;
	return detail === null || detail === undefined || detail === "" ? node.name : detail;
}

/** One view's tree: roots from `prepare`, plus the levels expanded so far. */
export type TypeHierarchy = {
	roots: TypeHierarchyNode[];
	/** Neighbours fetched for one expanded node, keyed by `hierarchyKey`. */
	levels: Map<string, TypeHierarchyNode[]>;
	expanded: Set<string>;
};

export function emptyHierarchy(): TypeHierarchy {
	return { roots: [], levels: new Map(), expanded: new Set() };
}

export function createHierarchy(roots: TypeHierarchyNode[]): TypeHierarchy {
	return { roots: [...roots], levels: new Map(), expanded: new Set() };
}

/**
 * Fold one fetched level into the tree and mark its parent expanded. The level is deduplicated by
 * `hierarchyKey`, drops the node it hangs off, and drops anything already expanded or already a
 * root, which keeps a cyclic hierarchy (A's supertype B, B's supertype A) finite.
 */
export function mergeLevel(
	hierarchy: TypeHierarchy,
	parentKey: string,
	nodes: TypeHierarchyNode[],
): TypeHierarchy {
	const skip = new Set<string>(hierarchy.levels.keys());
	skip.add(parentKey);
	for (const root of hierarchy.roots) {
		skip.add(hierarchyKey(root));
	}
	const level: TypeHierarchyNode[] = [];
	const seen = new Set<string>();
	for (const node of nodes) {
		const key = hierarchyKey(node);
		if (skip.has(key) || seen.has(key)) {
			continue;
		}
		seen.add(key);
		level.push(node);
	}
	const levels = new Map(hierarchy.levels);
	levels.set(parentKey, level);
	return { ...hierarchy, levels, expanded: new Set(hierarchy.expanded).add(parentKey) };
}

/** Expand or collapse one node without fetching; a collapse keeps its cached level. */
export function setNodeExpanded(
	hierarchy: TypeHierarchy,
	key: string,
	expanded: boolean,
): TypeHierarchy {
	const next = new Set(hierarchy.expanded);
	if (expanded) {
		next.add(key);
	} else {
		next.delete(key);
	}
	return { ...hierarchy, expanded: next };
}

export type VisibleNode = {
	node: TypeHierarchyNode;
	key: string;
	/** Unique per position in the tree, so one type reached twice still gets a stable React key. */
	id: string;
	depth: number;
	expanded: boolean;
};

/** Every node on screen, depth first, descending only into expanded nodes: the keyboard order. */
export function flatVisible(hierarchy: TypeHierarchy): VisibleNode[] {
	const outlined: VisibleNode[] = [];
	const walk = (nodes: TypeHierarchyNode[], depth: number, prefix: string) => {
		for (const node of nodes) {
			const key = hierarchyKey(node);
			const id = `${prefix}\u0000${key}`;
			const expanded = hierarchy.expanded.has(key);
			outlined.push({ node, key, id, depth, expanded });
			if (expanded) {
				walk(hierarchy.levels.get(key) ?? [], depth + 1, id);
			}
		}
	};
	walk(hierarchy.roots, 0, "");
	return outlined;
}
