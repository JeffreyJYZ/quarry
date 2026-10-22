import { useCallback, useEffect, useRef, useState } from "react";
import { type FileEntry, type GitStatusEntry, listDir } from "@/project/api";
import { describeError } from "@/project/errors";

type DirState =
	| { status: "loading" }
	| { status: "ready"; entries: FileEntry[] }
	| { status: "error"; message: string };

export type FileTreeProps = {
	root: string;
	activePath: string | null;
	onOpenFile: (entry: FileEntry) => void;
	changes?: Record<string, GitStatusEntry["status"]>;
	revealToken?: number;
};

type TreeLevelProps = {
	path: string;
	depth: number;
	dirs: Record<string, DirState>;
	expanded: Set<string>;
	activePath: string | null;
	highlightedPath: string | null;
	onToggle: (path: string) => void;
	onRetry: (path: string) => void;
	onOpenFile: (entry: FileEntry) => void;
	changes: Record<string, GitStatusEntry["status"]>;
};

function indent(depth: number): { paddingLeft: string } {
	return { paddingLeft: `${8 + depth * 12}px` };
}

/** One directory level: its cached entries plus the expanded children beneath them. */
function TreeLevel({
	path,
	depth,
	dirs,
	expanded,
	activePath,
	highlightedPath,
	onToggle,
	onRetry,
	onOpenFile,
	changes,
}: TreeLevelProps) {
	const state = dirs[path];
	const noteStyle = indent(depth + 1);

	if (!state || state.status === "loading") {
		return (
			<p className="tree-note" style={noteStyle}>
				loading...
			</p>
		);
	}

	if (state.status === "error") {
		return (
			<button
				type="button"
				className="tree-note error"
				style={noteStyle}
				title={state.message}
				onClick={() => onRetry(path)}
			>
				{state.message} (retry)
			</button>
		);
	}

	if (state.entries.length === 0) {
		return (
			<p className="tree-note" style={noteStyle}>
				empty
			</p>
		);
	}

	const hasChangeUnder = (dirPath: string) =>
		Object.keys(changes).some((p) => p === dirPath || p.startsWith(`${dirPath}/`));

	const badgeFor = (status: GitStatusEntry["status"] | undefined) => {
		if (status === undefined) return null;
		const letter =
			status === "modified"
				? "M"
				: status === "added"
					? "A"
					: status === "deleted"
						? "D"
						: status === "renamed"
							? "R"
							: status === "untracked"
								? "?"
								: "!";
		const cls =
			status === "modified"
				? "tree-badge modified"
				: status === "added"
					? "tree-badge added"
					: status === "deleted"
						? "tree-badge deleted"
						: status === "renamed"
							? "tree-badge renamed"
							: status === "untracked"
								? "tree-badge untracked"
								: "tree-badge conflicted";
		return <span className={cls}>{letter}</span>;
	};

	return (
		<ul className="tree">
			{state.entries.map((entry) => {
				const isOpen = entry.isDir && expanded.has(entry.path);
				const status = changes[entry.path];
				return (
					<li key={entry.path}>
						{entry.isDir ? (
							<button
								type="button"
								className={isOpen ? "tree-row dir expanded" : "tree-row dir"}
								style={indent(depth)}
								aria-expanded={isOpen}
								title={entry.path}
								onClick={() => onToggle(entry.path)}
							>
								<span className="caret" aria-hidden="true" />
								<span className="tree-name">{entry.name}</span>
								<span className="tree-badge-slot">
									{hasChangeUnder(entry.path) ? (
										<span className="tree-dir-dot" aria-hidden="true" />
									) : null}
								</span>
							</button>
						) : (
							<button
								type="button"
								data-path={entry.path}
								className={
									entry.path === activePath
										? "tree-row file active"
										: entry.path === highlightedPath
											? "tree-row file revealed"
											: "tree-row file"
								}
								style={indent(depth)}
								title={entry.path}
								onClick={() => onOpenFile(entry)}
							>
								<span className="spacer" aria-hidden="true" />
								<span className="tree-name">{entry.name}</span>
								<span className="tree-badge-slot">{badgeFor(status) ?? null}</span>
							</button>
						)}
						{isOpen ? (
							<TreeLevel
								path={entry.path}
								depth={depth + 1}
								dirs={dirs}
								expanded={expanded}
								activePath={activePath}
								highlightedPath={highlightedPath}
								onToggle={onToggle}
								onRetry={onRetry}
								onOpenFile={onOpenFile}
								changes={changes}
							/>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

export default function FileTree({
	root,
	activePath,
	onOpenFile,
	changes,
	revealToken,
}: FileTreeProps) {
	const changeMap = changes ?? {};
	const [dirs, setDirs] = useState<Record<string, DirState>>({});
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
	const pending = useRef<Set<string>>(new Set());
	const settled = useRef<Set<string>>(new Set());
	const promises = useRef<Map<string, Promise<void>>>(new Map());
	const highlightTimer = useRef<number | null>(null);

	const load = useCallback((path: string): Promise<void> => {
		const existing = promises.current.get(path);
		if (existing !== undefined) {
			return existing;
		}
		if (settled.current.has(path)) {
			return Promise.resolve();
		}
		pending.current.add(path);
		setDirs((current) => ({ ...current, [path]: { status: "loading" } }));
		const promise = listDir(path)
			.then((entries) => {
				pending.current.delete(path);
				settled.current.add(path);
				setDirs((current) => ({ ...current, [path]: { status: "ready", entries } }));
			})
			.catch((error: unknown) => {
				pending.current.delete(path);
				setDirs((current) => ({
					...current,
					[path]: { status: "error", message: describeError(error) },
				}));
				throw error;
			});
		promises.current.set(path, promise);
		return promise;
	}, []);

	useEffect(() => {
		void load(root).catch(() => {
			/* root load failure surfaces through the tree */
		});
	}, [load, root]);

	const toggle = useCallback(
		(path: string) => {
			const isOpen = expanded.has(path);
			setExpanded((current) => {
				const next = new Set(current);
				if (isOpen) {
					next.delete(path);
				} else {
					next.add(path);
				}
				return next;
			});
			if (!isOpen) {
				void load(path).catch(() => {
					/* surfaces through the tree */
				});
			}
			setHighlightedPath(null);
		},
		[expanded, load],
	);

	const openFile = useCallback(
		(entry: FileEntry) => {
			setHighlightedPath(null);
			onOpenFile(entry);
		},
		[onOpenFile],
	);

	const reveal = useCallback(
		async (target: string | null) => {
			if (target === null) {
				return;
			}
			if (!target.startsWith(`${root}/`)) {
				return;
			}
			const parts = target
				.slice(root.length + 1)
				.split("/")
				.filter((part) => part.length > 0);
			let current = root;
			const ancestors: string[] = [];
			for (const part of parts.slice(0, -1)) {
				current = `${current}/${part}`;
				if (current !== root) {
					ancestors.push(current);
				}
			}
			try {
				for (const dir of ancestors) {
					await load(dir);
				}
			} catch {
				return;
			}
			setExpanded((prev) => {
				const next = new Set(prev);
				for (const dir of ancestors) {
					next.add(dir);
				}
				return next;
			});
			setHighlightedPath(target);
			if (highlightTimer.current !== null) {
				window.clearTimeout(highlightTimer.current);
			}
			highlightTimer.current = window.setTimeout(() => {
				setHighlightedPath(null);
				highlightTimer.current = null;
			}, 1500);
			window.setTimeout(() => {
				const row = document.querySelector(`[data-path="${CSS.escape(target)}"]`);
				if (row instanceof HTMLElement) {
					row.scrollIntoView({ block: "nearest" });
				}
			}, 0);
		},
		[root, load],
	);

	useEffect(() => {
		if (revealToken === undefined) {
			return;
		}
		void reveal(activePath);
	}, [revealToken, reveal, activePath]);

	useEffect(() => {
		return () => {
			if (highlightTimer.current !== null) {
				window.clearTimeout(highlightTimer.current);
			}
		};
	}, []);

	return (
		<div className="tree-scroll">
			<TreeLevel
				path={root}
				depth={0}
				dirs={dirs}
				expanded={expanded}
				activePath={activePath}
				highlightedPath={highlightedPath}
				onToggle={toggle}
				onRetry={load}
				onOpenFile={openFile}
				changes={changeMap}
			/>
		</div>
	);
}
