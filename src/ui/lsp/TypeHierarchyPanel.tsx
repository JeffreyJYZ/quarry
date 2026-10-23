import {
	type ReactElement,
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import "@/ui/lsp/typeHierarchy.css";

export type TypeHierarchyPanelProps = {
	root: string;
	path: string;
	cursor: { line: number; character: number };
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
};

const DIRECTIONS: TypeHierarchyDirection[] = ["supertypes", "subtypes"];

const TITLES: Record<TypeHierarchyDirection, string> = {
	supertypes: "Supertypes",
	subtypes: "Subtypes",
};

const EMPTY_NOTES: Record<TypeHierarchyDirection, string> = {
	supertypes: "No supertypes",
	subtypes: "No subtypes",
};

/** One hierarchy per direction, so switching views keeps each side's expansions. */
type Hierarchies = Record<TypeHierarchyDirection, TypeHierarchy>;

function freshHierarchies(): Hierarchies {
	return { supertypes: emptyHierarchy(), subtypes: emptyHierarchy() };
}

/**
 * Type hierarchy: the types above or below the caret's symbol. Every level is fetched on demand,
 * one node per click, because a hierarchy can be far larger than one call should ask for.
 */
export default function TypeHierarchyPanel({
	root,
	path,
	cursor,
	onNavigate,
	onClose,
}: TypeHierarchyPanelProps) {
	const [direction, setDirection] = useState<TypeHierarchyDirection>("supertypes");
	const [hierarchies, setHierarchies] = useState<Hierarchies>(freshHierarchies);
	const [prepared, setPrepared] = useState<TypeHierarchyNode[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingKey, setLoadingKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [copyState, setCopyState] = useState<string | null>(null);
	const panel = useRef<HTMLElement | null>(null);
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

	useEffect(() => {
		panel.current?.focus();
	}, []);

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

	const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
		if (event.key === "Enter") {
			// A focused button already handles Enter; only the panel itself needs to act on it.
			const target = event.target;
			if (target instanceof HTMLElement && target.closest("button") !== null) return;
			event.preventDefault();
			if (active !== null) open(active);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		if (order.length === 0) return;
		event.preventDefault();
		const step = event.key === "ArrowDown" ? 1 : -1;
		const index = active === null ? -1 : order.findIndex((entry) => entry.id === active.id);
		let next = index < 0 ? (step === 1 ? 0 : order.length - 1) : index + step;
		next = Math.min(order.length - 1, Math.max(0, next));
		setActiveKey(order[next]?.id ?? null);
	};

	const row = (entry: VisibleNode): ReactElement => {
		const { node, id, depth, expanded } = entry;
		const key = hierarchyKey(node);
		const busy = loadingKey === `${direction}:${key}`;
		const level = hierarchy.levels.get(key);
		const pad = { paddingLeft: `${6 + depth * 14}px` };
		const name = (
			<>
				<span className="type-hierarchy-label">{node.name}</span>
				{node.detail !== null && node.detail !== "" ? (
					<span className="type-hierarchy-detail">{node.detail}</span>
				) : null}
				<span className="type-hierarchy-file">
					{node.path.split("/").pop()}:{node.line + 1}
				</span>
			</>
		);
		return (
			<div key={id}>
				<div
					className={
						entry.id === activeKey ? "type-hierarchy-row active" : "type-hierarchy-row"
					}
					style={pad}
				>
					<button
						type="button"
						className="type-hierarchy-expand"
						aria-label={expanded ? `collapse ${node.name}` : `expand ${node.name}`}
						onClick={() => toggle(node)}
					>
						{expanded ? "▾" : "▸"}
					</button>
					{isSelectable(node) ? (
						<button
							type="button"
							className="type-hierarchy-name"
							title={`${node.path}:${node.line + 1}`}
							onClick={() => open(entry)}
						>
							{name}
						</button>
					) : (
						<span
							className="type-hierarchy-name disabled"
							title="No file for this type"
						>
							{name}
						</span>
					)}
				</div>
				{busy ? (
					<p
						className="type-hierarchy-loading"
						style={{ paddingLeft: `${6 + (depth + 1) * 14}px` }}
					>
						Loading {TITLES[direction].toLowerCase()}…
					</p>
				) : null}
				{expanded && level !== undefined && level.length === 0 ? (
					<p
						className="type-hierarchy-empty"
						style={{ paddingLeft: `${6 + (depth + 1) * 14}px` }}
					>
						{EMPTY_NOTES[direction]}
					</p>
				) : null}
			</div>
		);
	};

	return (
		<section
			ref={panel}
			className="type-hierarchy-panel"
			aria-label="Type hierarchy"
			tabIndex={-1}
			onKeyDown={handleKeyDown}
		>
			<div className="type-hierarchy-head">
				<span className="type-hierarchy-title">Type hierarchy</span>
				<div className="type-hierarchy-tools">
					<button
						type="button"
						className="type-hierarchy-action"
						onClick={copyQualified}
						disabled={active === null}
					>
						copy qualified name
					</button>
					<button type="button" className="type-hierarchy-close" onClick={onClose}>
						close
					</button>
				</div>
			</div>
			<div className="type-hierarchy-tabs">
				{DIRECTIONS.map((value) => (
					<button
						key={value}
						type="button"
						className={
							value === direction ? "type-hierarchy-tab active" : "type-hierarchy-tab"
						}
						aria-pressed={value === direction}
						onClick={() => {
							setDirection(value);
							setActiveKey(null);
							setCopyState(null);
						}}
					>
						{TITLES[value]}
					</button>
				))}
			</div>
			<div className="type-hierarchy-body">
				{error !== null ? <p className="type-hierarchy-error">{error}</p> : null}
				{loading ? (
					<p className="type-hierarchy-loading">Loading type hierarchy…</p>
				) : prepared === null ? null : prepared.length === 0 ? (
					<p className="type-hierarchy-empty">No type hierarchy for this symbol</p>
				) : (
					<>
						{visible.map((entry) => row(entry))}
						{copyState !== null ? (
							<p className="type-hierarchy-note">{copyState}</p>
						) : null}
					</>
				)}
			</div>
		</section>
	);
}
