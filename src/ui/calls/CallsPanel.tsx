import { type ReactElement, useCallback, useEffect, useState } from "react";
import {
	type CallHierarchyNode,
	lspCallHierarchyCalls,
	lspCallHierarchyPrepare,
} from "@/lib/project/api";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import { symbolFailureNotice } from "@/lib/lsp/errors";
import { useRunningSessions } from "@/lib/lsp/useLspContext";
import { fileName } from "@/lib/project/paths";
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
	const running = useRunningSessions();
	const [direction, setDirection] = useState<Direction>("incoming");
	const [prepared, setPrepared] = useState<CallHierarchyNode[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [noServer, setNoServer] = useState(false);
	const [children, setChildren] = useState<Map<number, CallHierarchyNode[]>>(() => new Map());
	const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
	const [loadingNodes, setLoadingNodes] = useState<Set<number>>(() => new Set());

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setPrepared(null);
		setNoServer(false);
		setChildren(new Map());
		setExpanded(new Set());
		setLoadingNodes(new Set());
		const kind = servedByRunningServer(path, running);
		if (kind === null) {
			setPrepared(null);
			setNoServer(true);
			setLoading(false);
			return;
		}
		setNoServer(false);
		const sid = sessionId(kind, root);
		void lspCallHierarchyPrepare(sid, path, cursor.line, cursor.character)
			.then((nodes) => {
				if (cancelled) return;
				setPrepared(nodes);
				setLoading(false);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(symbolFailureNotice(err));
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [root, path, cursor.line, cursor.character, running]);

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
					setError(symbolFailureNotice(err));
					setLoadingNodes((current) => {
						const next = new Set(current);
						next.delete(node.itemId);
						return next;
					});
				});
		},
		[root, path, running, direction, expanded, children, loadingNodes],
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
						{fileName(node.path)}:{node.line + 1}
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
				) : noServer ? (
					<p className="calls-empty">No language server for this file</p>
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
