import { describe, expect, test } from "bun:test";
import {
	createHierarchy,
	flatVisible,
	hierarchyKey,
	isSelectable,
	lspPrepareTypeHierarchy,
	mergeLevel,
	neighbourNodes,
	qualifiedName,
	setNodeExpanded,
	type TypeHierarchyNode,
} from "@/lib/lsp/typeHierarchy";

function node(name: string, line = 0): TypeHierarchyNode {
	return {
		name,
		kind: 23,
		uri: `file:///p/src/${name}.rs`,
		path: `/p/src/${name}.rs`,
		line,
		character: 0,
		detail: null,
		children: [],
		parents: [],
	};
}

describe("mergeLevel", () => {
	test("folds a fetched level under its parent and marks the parent expanded", () => {
		const root = node("Shape", 3);
		const before = createHierarchy([root]);
		const after = mergeLevel(before, hierarchyKey(root), [node("Base", 8), node("Object", 1)]);

		expect(after.levels.get(hierarchyKey(root))?.map((entry) => entry.name)).toEqual([
			"Base",
			"Object",
		]);
		expect(after.expanded.has(hierarchyKey(root))).toBe(true);
		// The input hierarchy is untouched.
		expect(before.levels.size).toBe(0);
		expect(before.expanded.size).toBe(0);
	});

	test("deduplicates by uri, line and character, not by name", () => {
		const root = node("Shape", 3);
		const hierarchy = createHierarchy([root]);
		const twin = { ...node("Base", 8), name: "BaseAlias", detail: "trait Base" };
		const merged = mergeLevel(hierarchy, hierarchyKey(root), [node("Base", 8), twin]);

		expect(merged.levels.get(hierarchyKey(root))).toHaveLength(1);
		expect(merged.levels.get(hierarchyKey(root))?.[0]?.name).toBe("Base");
	});

	test("drops the parent itself, roots and already expanded nodes, so a cycle stays finite", () => {
		const root = node("Shape", 3);
		const base = node("Base", 8);
		const start = mergeLevel(createHierarchy([root]), hierarchyKey(root), [base]);
		const cyclic = mergeLevel(start, hierarchyKey(base), [base, root, node("Object", 1)]);

		expect(cyclic.levels.get(hierarchyKey(base))?.map((entry) => entry.name)).toEqual([
			"Object",
		]);
	});

	test("an empty fetched level expands the node and caches nothing under it", () => {
		const root = node("Shape", 3);
		const merged = mergeLevel(createHierarchy([root]), hierarchyKey(root), []);

		expect(merged.levels.get(hierarchyKey(root))).toEqual([]);
		expect(merged.expanded.has(hierarchyKey(root))).toBe(true);
	});
});

describe("flatVisible", () => {
	const root = node("Shape", 3);
	const base = node("Base", 8);
	const derived = node("Circle", 12);
	const deep = node("Round", 20);

	function tree() {
		const first = mergeLevel(createHierarchy([root]), hierarchyKey(root), [base, derived]);
		return mergeLevel(first, hierarchyKey(derived), [deep]);
	}

	test("walks depth first, descending only into expanded nodes", () => {
		const visible = flatVisible(tree());

		expect(visible.map((entry) => entry.node.name)).toEqual([
			"Shape",
			"Base",
			"Circle",
			"Round",
		]);
		expect(visible.map((entry) => entry.depth)).toEqual([0, 1, 1, 2]);
		expect(visible.map((entry) => entry.expanded)).toEqual([true, false, true, false]);
	});

	test("collapsing a node hides its subtree but keeps the cached level", () => {
		const collapsed = setNodeExpanded(tree(), hierarchyKey(derived), false);
		const visible = flatVisible(collapsed);

		expect(visible.map((entry) => entry.node.name)).toEqual(["Shape", "Base", "Circle"]);
		expect(collapsed.levels.get(hierarchyKey(derived))?.map((entry) => entry.name)).toEqual([
			"Round",
		]);
	});

	test("flat order spans every root in list order", () => {
		const second = node("Other", 40);
		const visible = flatVisible(createHierarchy([root, second]));

		expect(visible.map((entry) => entry.node.name)).toEqual(["Shape", "Other"]);
	});

	test("ids stay unique when one type is reached by two branches", () => {
		const first = mergeLevel(createHierarchy([root]), hierarchyKey(root), [base, derived]);
		const twice = mergeLevel(first, hierarchyKey(base), [derived]);
		const visible = flatVisible(twice);

		expect(new Set(visible.map((entry) => entry.id)).size).toBe(visible.length);
	});
});

describe("node helpers", () => {
	test("qualifiedName prefers the detail, falling back to the name", () => {
		expect(qualifiedName({ ...node("Shape"), detail: "trait Shape: Base" })).toBe(
			"trait Shape: Base",
		);
		expect(qualifiedName(node("Shape"))).toBe("Shape");
		expect(qualifiedName({ ...node("Shape"), detail: "" })).toBe("Shape");
	});

	test("isSelectable requires a file path", () => {
		expect(isSelectable(node("Shape"))).toBe(true);
		expect(isSelectable({ ...node("Shape"), path: "" })).toBe(false);
	});

	test("neighbourNodes picks the list the view walks", () => {
		const root = node("Shape", 3);
		const answer = { item: { ...root, parents: [node("Base")], children: [node("Circle")] } };

		expect(neighbourNodes(answer, "supertypes").map((entry) => entry.name)).toEqual(["Base"]);
		expect(neighbourNodes(answer, "subtypes").map((entry) => entry.name)).toEqual(["Circle"]);
	});

	test("the command wrappers are callable functions", () => {
		expect(typeof lspPrepareTypeHierarchy).toBe("function");
	});
});
