import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
	type CallHierarchyNode,
	lspCallHierarchyCalls,
	lspCallHierarchyPrepare,
} from "@/lib/project/api";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import type { ServerKind } from "@/lib/lsp/served";
export type CallsPanelProps = {
	root: string;
	path: string;
	cursor: { line: number; character: number };
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
};

const MAX_DEPTH = 5; // cap recursion to avoid loops in cyclic call graphs

type Direction = "incoming" | "outgoing";

export default function CallsPanel({ root, path, cursor, onNavigate, onClose }: CallsPanelProps) {
	const [direction, setDirection] = useState<Direction>("incoming");
	const [prepared, setPrepared] = useState<CallHierarchyNode[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [children, setChildren] = useState<Map<number, CallHierarchyNode[]>>(() => new Map());
	const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
	const [loadingNodes, setLoadingNodes] = useState<Set<number>>(() => new Set());

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setPrepared(null);
		setChildren(new Map());
		setExpanded(new Set());
		setLoadingNodes(new Set());
		const running = new Set<ServerKind>(["rust-analyzer", "clangd"]);
		const kind = servedByRunningServer(path, running);
		if (kind === null) {
			setPrepared([]);
			setLoading(false);
			return;
		}
		const sid = sessionId(kind, root);
		void lspCallHierarchyPrepare(sid, path, cursor.line, cursor.character)
			.then((nodes) => {
				if (cancelled) return;
				setPrepared(nodes);
				setLoading(false);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [root, path, cursor.line, cursor.character]);

	const toggleNode = useCallback(
		(node: CallHierarchyNode, depth: number) => {
			if (depth >= MAX_DEPTH) return;
			if (expanded.has(node.itemId)) {
				setExpanded((current) => {
					const next = new Set(current);
					next.delete(node.itemId);
					return next;
				});
				return;
			}
			const running = new Set<ServerKind>(["rust-analyzer", "clangd"]);
			const kind = servedByRunningServer(path, running);
			if (kind === null) return;
			const sid = sessionId(kind, root);
			if (children.has(node.itemId) || loadingNodes.has(node.itemId)) return;
			setLoadingNodes((current) => new Set(current).add(node.itemId));
			void lspCallHierarchyCalls(sid, node.itemId, direction)
				.then((nodes) => {
					setChildren((current) => {
						const next = new Map(current);
						next.set(node.itemId, nodes);
						return next;
					});
					setExpanded((current) => new Set(current).add(node.itemId));
					setLoadingNodes((current) => {
						const next = new Set(current);
						next.delete(node.itemId);
						return next;
					});
				})
				.catch((err: unknown) => {
					setError(err instanceof Error ? err.message : String(err));
					setLoadingNodes((current) => {
						const next = new Set(current);
						next.delete(node.itemId);
						return next;
					});
				});
		},
		[root, path, direction, expanded, children, loadingNodes],
	);

	const renderNode = (node: CallHierarchyNode, depth: number): ReactElement => {
		const isExpanded = expanded.has(node.itemId);
		const isLoading = loadingNodes.has(node.itemId);
		const kids = children.get(node.itemId) ?? [];
		const lastSeg = node.name.split(/[:.]/).pop() ?? node.name;
		return (
			<div key={node.itemId} className="calls-node" style={{ paddingLeft: depth * 12 }}>
				<button
					type="button"
					className="calls-expand"
					onClick={() => toggleNode(node, depth)}
					aria-label={isExpanded ? "collapse" : "expand"}
				>
					{isExpanded ? "▾" : "▸"}
				</button>
				<button
					type="button"
					className="calls-row"
					onClick={() => onNavigate(node.path, node.line, node.character)}
				>
					<span className="calls-name">{lastSeg}</span>
					<span className="calls-file">
						{node.path.split("/").pop()}:{node.line + 1}
					</span>
				</button>
				{isLoading ? <div className="calls-loading">Loading calls…</div> : null}
				{isExpanded ? (
					<div className="calls-children">
						{kids.length === 0 ? (
							<div className="calls-empty">
								{direction === "incoming"
									? "No incoming calls"
									: "No outgoing calls"}
							</div>
						) : (
							kids.map((child) => renderNode(child, depth + 1))
						)}
					</div>
				) : null}
			</div>
		);
	};

	return (
		<section className="calls-panel" aria-label="Call hierarchy">
			<div className="calls-head">
				<span className="calls-title">Calls</span>
				<button type="button" className="calls-close" onClick={onClose}>
					close
				</button>
			</div>
			<div className="calls-tabs">
				<button
					type="button"
					className={direction === "incoming" ? "calls-tab active" : "calls-tab"}
					aria-pressed={direction === "incoming"}
					onClick={() => setDirection("incoming")}
				>
					Incoming
				</button>
				<button
					type="button"
					className={direction === "outgoing" ? "calls-tab active" : "calls-tab"}
					aria-pressed={direction === "outgoing"}
					onClick={() => setDirection("outgoing")}
				>
					Outgoing
				</button>
			</div>
			<div className="calls-body">
				{loading ? (
					<p className="calls-loading">Loading calls…</p>
				) : error ? (
					<p className="calls-error">{error}</p>
				) : prepared === null || prepared.length === 0 ? (
					<p className="calls-empty">
						{direction === "incoming" ? "No incoming calls" : "No outgoing calls"}
					</p>
				) : (
					prepared.map((node) => renderNode(node, 0))
				)}
			</div>
		</section>
	);
}
