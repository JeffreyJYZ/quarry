import { useEffect, useRef } from "react";
import { DIRECTIONS, TITLES } from "@/ui/lsp/parts";
import { useHierarchy } from "@/ui/lsp/useHierarchy";
import HierarchyNode from "@/ui/lsp/HierarchyNode";
import "@/ui/lsp/typeHierarchy.css";

export type TypeHierarchyPanelProps = {
	root: string;
	path: string;
	cursor: { line: number; character: number };
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
};

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
	const tree = useHierarchy({ root, path, cursor, onNavigate, onClose });
	const panel = useRef<HTMLElement | null>(null);

	useEffect(() => {
		panel.current?.focus();
	}, []);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
		if (event.key === "Enter") {
			// A focused button already handles Enter; only the panel itself needs to act on it.
			const target = event.target;
			if (target instanceof HTMLElement && target.closest("button") !== null) return;
			event.preventDefault();
			if (tree.active !== null) tree.open(tree.active);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		if (tree.order.length === 0) return;
		event.preventDefault();
		const step = event.key === "ArrowDown" ? 1 : -1;
		const active = tree.active;
		const index =
			active === null ? -1 : tree.order.findIndex((entry) => entry.id === active.id);
		let next = index < 0 ? (step === 1 ? 0 : tree.order.length - 1) : index + step;
		next = Math.min(tree.order.length - 1, Math.max(0, next));
		tree.setActiveKey(tree.order[next]?.id ?? null);
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
						onClick={tree.copyQualified}
						disabled={tree.active === null}
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
							value === tree.direction
								? "type-hierarchy-tab active"
								: "type-hierarchy-tab"
						}
						aria-pressed={value === tree.direction}
						onClick={() => {
							tree.setDirection(value);
							tree.setActiveKey(null);
							tree.setCopyState(null);
						}}
					>
						{TITLES[value]}
					</button>
				))}
			</div>
			<div className="type-hierarchy-body">
				{tree.error !== null ? <p className="type-hierarchy-error">{tree.error}</p> : null}
				{tree.loading ? (
					<p className="type-hierarchy-loading">Loading type hierarchy…</p>
				) : tree.prepared === null ? null : tree.prepared.length === 0 ? (
					<p className="type-hierarchy-empty">No type hierarchy for this symbol</p>
				) : (
					<>
						{tree.visible.map((entry) => (
							<HierarchyNode
								key={entry.id}
								entry={entry}
								activeKey={tree.activeKey}
								direction={tree.direction}
								hierarchy={tree.hierarchy}
								loadingKey={tree.loadingKey}
								onToggle={tree.toggle}
								onOpen={tree.open}
							/>
						))}
						{tree.copyState !== null ? (
							<p className="type-hierarchy-note">{tree.copyState}</p>
						) : null}
					</>
				)}
			</div>
		</section>
	);
}
