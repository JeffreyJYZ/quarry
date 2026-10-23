import type { ReactElement } from "react";
import { TITLES, EMPTY_NOTES } from "@/ui/lsp/parts";
import {
	type TypeHierarchyNode,
	type VisibleNode,
	hierarchyKey,
	isSelectable,
} from "@/lib/lsp/typeHierarchy";
import type { TypeHierarchy } from "@/lib/lsp/typeHierarchy";

/** One row of the type hierarchy: expand twisty, name (selectable or not), loading/empty notes. */
export default function HierarchyNode({
	entry,
	activeKey,
	direction,
	hierarchy,
	loadingKey,
	onToggle,
	onOpen,
}: {
	entry: VisibleNode;
	activeKey: string | null;
	direction: "supertypes" | "subtypes";
	hierarchy: TypeHierarchy;
	loadingKey: string | null;
	onToggle: (node: TypeHierarchyNode) => void;
	onOpen: (entry: VisibleNode) => void;
}): ReactElement {
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
					onClick={() => onToggle(node)}
				>
					{expanded ? "▾" : "▸"}
				</button>
				{isSelectable(node) ? (
					<button
						type="button"
						className="type-hierarchy-name"
						title={`${node.path}:${node.line + 1}`}
						onClick={() => onOpen(entry)}
					>
						{name}
					</button>
				) : (
					<span className="type-hierarchy-name disabled" title="No file for this type">
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
}
