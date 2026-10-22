import { useCallback, useEffect, useRef, useState } from "react";
import { type FileEntry, listDir } from "@/project/api";
import { describeError } from "@/project/errors";

type DirState =
	| { status: "loading" }
	| { status: "ready"; entries: FileEntry[] }
	| { status: "error"; message: string };

export type FileTreeProps = {
	root: string;
	activePath: string | null;
	onOpenFile: (entry: FileEntry) => void;
};

type TreeLevelProps = {
	path: string;
	depth: number;
	dirs: Record<string, DirState>;
	expanded: Set<string>;
	activePath: string | null;
	onToggle: (path: string) => void;
	onRetry: (path: string) => void;
	onOpenFile: (entry: FileEntry) => void;
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
	onToggle,
	onRetry,
	onOpenFile,
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

	return (
		<ul className="tree">
			{state.entries.map((entry) => {
				const isOpen = entry.isDir && expanded.has(entry.path);
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
							</button>
						) : (
							<button
								type="button"
								className={
									entry.path === activePath
										? "tree-row file active"
										: "tree-row file"
								}
								style={indent(depth)}
								title={entry.path}
								onClick={() => onOpenFile(entry)}
							>
								<span className="spacer" aria-hidden="true" />
								<span className="tree-name">{entry.name}</span>
							</button>
						)}
						{isOpen ? (
							<TreeLevel
								path={entry.path}
								depth={depth + 1}
								dirs={dirs}
								expanded={expanded}
								activePath={activePath}
								onToggle={onToggle}
								onRetry={onRetry}
								onOpenFile={onOpenFile}
							/>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

export default function FileTree({ root, activePath, onOpenFile }: FileTreeProps) {
	const [dirs, setDirs] = useState<Record<string, DirState>>({});
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const pending = useRef<Set<string>>(new Set());
	const settled = useRef<Set<string>>(new Set());

	const load = useCallback((path: string) => {
		if (pending.current.has(path) || settled.current.has(path)) {
			return;
		}
		pending.current.add(path);
		setDirs((current) => ({ ...current, [path]: { status: "loading" } }));
		listDir(path).then(
			(entries) => {
				pending.current.delete(path);
				settled.current.add(path);
				setDirs((current) => ({ ...current, [path]: { status: "ready", entries } }));
			},
			(error: unknown) => {
				pending.current.delete(path);
				setDirs((current) => ({
					...current,
					[path]: { status: "error", message: describeError(error) },
				}));
			},
		);
	}, []);

	useEffect(() => {
		load(root);
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
				load(path);
			}
		},
		[expanded, load],
	);

	return (
		<div className="tree-scroll">
			<TreeLevel
				path={root}
				depth={0}
				dirs={dirs}
				expanded={expanded}
				activePath={activePath}
				onToggle={toggle}
				onRetry={load}
				onOpenFile={onOpenFile}
			/>
		</div>
	);
}
