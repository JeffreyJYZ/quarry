import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	createHierarchy,
	emptyHierarchy,
	flatVisible,
	hierarchyKey,
	isSelectable,
	lspPrepareTypeHierarchy,
	lspTypeHierarchy,
	mergeLevel,
	neighbourNodes,
	qualifiedName,
	setNodeExpanded,
	type TypeHierarchy,
	type TypeHierarchyDirection,
	type TypeHierarchyNode,
	type VisibleNode,
} from "@/lib/lsp/typeHierarchy";
import { describeError } from "@/lib/project/errors";

type Hierarchies = Record<TypeHierarchyDirection, TypeHierarchy>;

function freshHierarchies(): Hierarchies {
	return { supertypes: emptyHierarchy(), subtypes: emptyHierarchy() };
}

/** All type-hierarchy state plus the prepare/expand actions, leaving the panel as a shell. */
export function useHierarchy({
	root,
	path,
	cursor,
	onNavigate,
	onClose,
}: {
	root: string;
	path: string;
	cursor: { line: number; character: number };
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
}) {
	const [direction, setDirection] = useState<TypeHierarchyDirection>("supertypes");
	const [hierarchies, setHierarchies] = useState<Hierarchies>(freshHierarchies);
	const [prepared, setPrepared] = useState<TypeHierarchyNode[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingKey, setLoadingKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [copyState, setCopyState] = useState<string | null>(null);
	/** Bumped per prepare, so a level fetched for an old symbol cannot land in the new tree. */
	const generation = useRef(0);

	useEffect(() => {
		let cancelled = false;
		generation.current += 1;
		const token = generation.current;
		setLoading(true);
		setError(null);
		setPrepared(null);
		setHierarchies(freshHierarchies());
		setActiveKey(null);
		setLoadingKey(null);
		setCopyState(null);
		lspPrepareTypeHierarchy(root, path, cursor.line, cursor.character).then(
			(nodes) => {
				if (cancelled || generation.current !== token) return;
				setPrepared(nodes);
				setHierarchies({
					supertypes: createHierarchy(nodes),
					subtypes: createHierarchy(nodes),
				});
				setLoading(false);
			},
			(reason: unknown) => {
				if (cancelled || generation.current !== token) return;
				setError(describeError(reason));
				setLoading(false);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [root, path, cursor.line, cursor.character]);

	/** Escape closes even after focus moved to the editor, so it is bound on the window. */
	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	const hierarchy = hierarchies[direction];
	const visible = useMemo(() => flatVisible(hierarchy), [hierarchy]);
	/** Keyboard order skips nodes that no file backs, because Enter could not open them. */
	const order = useMemo(() => visible.filter((entry) => isSelectable(entry.node)), [visible]);
	const active =
		activeKey === null ? null : (order.find((entry) => entry.id === activeKey) ?? null);

	const open = useCallback(
		(entry: VisibleNode) => {
			if (!isSelectable(entry.node)) return;
			setActiveKey(entry.id);
			setCopyState(null);
			onNavigate(entry.node.path, entry.node.line, entry.node.character);
		},
		[onNavigate],
	);

	const toggle = useCallback(
		(node: TypeHierarchyNode) => {
			const key = hierarchyKey(node);
			const keyed = `${direction}:${key}`;
			const current = hierarchies[direction];
			if (current.expanded.has(key)) {
				setHierarchies((previous) => ({
					...previous,
					[direction]: setNodeExpanded(previous[direction], key, false),
				}));
				return;
			}
			if (current.levels.has(key)) {
				setHierarchies((previous) => ({
					...previous,
					[direction]: setNodeExpanded(previous[direction], key, true),
				}));
				return;
			}
			const token = generation.current;
			setLoadingKey(keyed);
			setError(null);
			lspTypeHierarchy(root, node).then(
				(answer) => {
					if (generation.current !== token) return;
					const nodes = neighbourNodes(answer, direction);
					setHierarchies((previous) => ({
						...previous,
						[direction]: mergeLevel(previous[direction], key, nodes),
					}));
					setLoadingKey(null);
				},
				(reason: unknown) => {
					if (generation.current !== token) return;
					setError(describeError(reason));
					setLoadingKey(null);
				},
			);
		},
		[root, direction, hierarchies],
	);

	const copyQualified = useCallback(() => {
		if (active === null) return;
		const name = qualifiedName(active.node);
		void (async () => {
			try {
				await navigator.clipboard.writeText(name);
				setCopyState(`copied ${name}`);
			} catch (reason) {
				setError(`Copy: ${describeError(reason)}`);
			}
		})();
	}, [active]);

	return {
		direction,
		setDirection,
		hierarchy,
		visible,
		order,
		active,
		activeKey,
		setActiveKey,
		prepared,
		loading,
		loadingKey,
		error,
		copyState,
		setCopyState,
		open,
		toggle,
		copyQualified,
	};
}
