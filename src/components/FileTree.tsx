import { useCallback, useEffect, useRef, useState } from "react";
import { type FileEntry, type GitStatusEntry, listDir } from "@/project/api";
import { describeError } from "@/project/errors";
import { createDir, createFile, deletePath, renamePath } from "@/project/fileOps";

type DirState =
	| { status: "loading" }
	| { status: "ready"; entries: FileEntry[] }
	| { status: "error"; message: string };

/** Inline glyphs: the tree action buttons used to rely on emoji, which render as boxes in WKWebView. */
function FolderIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
			<path
				d="M1 2.5h3l1 1h4v5H1z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PencilIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
			<path
				d="M2 8l.5-2L7 1.5 8.5 3 4 7.5z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export type FileTreeProps = {
	root: string;
	activePath: string | null;
	onOpenFile: (entry: FileEntry) => void;
	onFileRenamed?: (oldPath: string, newPath: string) => void;
	onFileDeleted?: (path: string) => void;
	onNotice?: (message: string) => void;
	changes?: Record<string, GitStatusEntry["status"]>;
	revealToken?: number;
};

type EditState =
	| { kind: "create-file"; parent: string }
	| { kind: "create-dir"; parent: string }
	| { kind: "rename"; target: string };

function indent(depth: number): { paddingLeft: string } {
	return { paddingLeft: `${8 + depth * 12}px` };
}

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
	onAction: (entry: FileEntry, action: "new-file" | "new-folder" | "rename" | "delete") => void;
	onCommitEdit: (parent: string, name: string, kind: EditState["kind"]) => void;
	onCancelEdit: () => void;
	editing: EditState | null;
	deleteConfirm: string | null;
	onConfirmDelete: (path: string) => void;
	onCancelDelete: () => void;
	changes: Record<string, GitStatusEntry["status"]>;
};

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
	onAction,
	onCommitEdit,
	onCancelEdit,
	editing,
	deleteConfirm,
	onConfirmDelete,
	onCancelDelete,
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
	if (
		state.entries.length === 0 &&
		!(editing !== null && "parent" in editing && editing.parent === path)
	) {
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

	const showCreateInput =
		editing?.kind.startsWith("create") === true &&
		editing !== null &&
		"parent" in editing &&
		editing.parent === path;

	return (
		<ul className="tree">
			{state.entries.map((entry) => {
				const isOpen = entry.isDir && expanded.has(entry.path);
				const status = changes[entry.path];
				const isRenaming =
					editing !== null && editing.kind === "rename" && editing.target === entry.path;
				const isDeleting = deleteConfirm === entry.path;
				return (
					<li key={entry.path}>
						{isRenaming ? (
							<div className="tree-row edit-row" style={indent(depth)}>
								<input
									className="tree-input"
									ref={(node) => node?.focus()}
									defaultValue={entry.name}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											const value = (
												event.target as HTMLInputElement
											).value.trim();
											onCommitEdit(entry.path, value, "rename");
										} else if (event.key === "Escape") {
											onCancelEdit();
										}
									}}
									onBlur={() => onCancelEdit()}
								/>
							</div>
						) : isDeleting ? (
							<div className="tree-row delete-row" style={indent(depth)}>
								<span className="tree-name">delete {entry.name}?</span>
								<button type="button" onClick={() => onConfirmDelete(entry.path)}>
									delete
								</button>
								<button type="button" onClick={onCancelDelete}>
									cancel
								</button>
							</div>
						) : (
							<div className="tree-row-wrap">
								{entry.isDir ? (
									<button
										type="button"
										className={
											isOpen ? "tree-row dir expanded" : "tree-row dir"
										}
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
										<span className="tree-badge-slot">
											{badgeFor(status) ?? null}
										</span>
									</button>
								)}
								<span className="tree-actions">
									{entry.isDir ? (
										<>
											<button
												type="button"
												title="New file"
												onClick={() => onAction(entry, "new-file")}
											>
												+
											</button>
											<button
												type="button"
												title="New folder"
												aria-label="New folder"
												onClick={() => onAction(entry, "new-folder")}
											>
												<FolderIcon />
											</button>
										</>
									) : null}
									<button
										type="button"
										title="Rename"
										aria-label="Rename"
										onClick={() => onAction(entry, "rename")}
									>
										<PencilIcon />
									</button>
									<button
										type="button"
										title="Delete"
										onClick={() => onAction(entry, "delete")}
									>
										×
									</button>
								</span>
							</div>
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
								onAction={onAction}
								onCommitEdit={onCommitEdit}
								onCancelEdit={onCancelEdit}
								editing={editing}
								deleteConfirm={deleteConfirm}
								onConfirmDelete={onConfirmDelete}
								onCancelDelete={onCancelDelete}
								changes={changes}
							/>
						) : null}
						{entry.isDir &&
						isOpen &&
						showCreateInput &&
						editing !== null &&
						"parent" in editing &&
						editing.parent === entry.path ? (
							<div className="tree-row edit-row" style={indent(depth + 1)}>
								<input
									className="tree-input"
									ref={(node) => node?.focus()}
									placeholder={
										editing.kind === "create-file" ? "new file" : "new folder"
									}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											const value = (
												event.target as HTMLInputElement
											).value.trim();
											onCommitEdit(entry.path, value, editing.kind);
										} else if (event.key === "Escape") {
											onCancelEdit();
										}
									}}
									onBlur={() => onCancelEdit()}
								/>
							</div>
						) : null}
					</li>
				);
			})}
			{showCreateInput &&
			editing !== null &&
			"parent" in editing &&
			editing.parent === path &&
			state.entries.length === 0 ? (
				<li>
					<div className="tree-row edit-row" style={indent(depth)}>
						<input
							className="tree-input"
							ref={(node) => node?.focus()}
							placeholder={editing.kind === "create-file" ? "new file" : "new folder"}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									const value = (event.target as HTMLInputElement).value.trim();
									onCommitEdit(path, value, editing.kind);
								} else if (event.key === "Escape") {
									onCancelEdit();
								}
							}}
							onBlur={() => onCancelEdit()}
						/>
					</div>
				</li>
			) : null}
		</ul>
	);
}

export default function FileTree({
	root,
	activePath,
	onOpenFile,
	onFileRenamed,
	onFileDeleted,
	onNotice,
	changes,
	revealToken,
}: FileTreeProps) {
	const changeMap = changes ?? {};
	const [dirs, setDirs] = useState<Record<string, DirState>>({});
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
	const [editing, setEditing] = useState<EditState | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
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

	const refreshDir = useCallback(
		(path: string) => {
			settled.current.delete(path);
			promises.current.delete(path);
			void load(path).catch(() => {
				/* surfaces */
			});
		},
		[load],
	);

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

	const handleAction = useCallback(
		(entry: FileEntry, action: "new-file" | "new-folder" | "rename" | "delete") => {
			if (action === "new-file") {
				setExpanded((current) => new Set(current).add(entry.path));
				void load(entry.path);
				setEditing({ kind: "create-file", parent: entry.path });
			} else if (action === "new-folder") {
				setExpanded((current) => new Set(current).add(entry.path));
				void load(entry.path);
				setEditing({ kind: "create-dir", parent: entry.path });
			} else if (action === "rename") {
				setEditing({ kind: "rename", target: entry.path });
			} else if (action === "delete") {
				setDeleteConfirm(entry.path);
			}
		},
		[load],
	);

	const commitEdit = useCallback(
		async (targetOrParent: string, name: string, kind: EditState["kind"]) => {
			if (name === "") {
				setEditing(null);
				return;
			}
			try {
				if (kind === "create-file") {
					await createFile(root, targetOrParent, name);
					refreshDir(targetOrParent);
				} else if (kind === "create-dir") {
					await createDir(root, targetOrParent, name);
					refreshDir(targetOrParent);
				} else if (kind === "rename") {
					const newPath = await renamePath(root, targetOrParent, name);
					const parent = targetOrParent.split("/").slice(0, -1).join("/");
					refreshDir(parent === "" ? root : parent);
					onFileRenamed?.(targetOrParent, newPath);
				}
			} catch (error) {
				onNotice?.(describeError(error));
			} finally {
				setEditing(null);
			}
		},
		[root, refreshDir, onFileRenamed, onNotice],
	);

	const confirmDelete = useCallback(
		async (path: string) => {
			setDeleteConfirm(null);
			try {
				await deletePath(root, path);
				const parent = path.split("/").slice(0, -1).join("/");
				refreshDir(parent === "" ? root : parent);
				onFileDeleted?.(path);
			} catch (error) {
				onNotice?.(describeError(error));
			}
		},
		[root, refreshDir, onFileDeleted, onNotice],
	);

	const reveal = useCallback(
		async (target: string | null) => {
			if (target === null) return;
			if (!target.startsWith(`${root}/`)) return;
			const parts = target
				.slice(root.length + 1)
				.split("/")
				.filter((p) => p.length > 0);
			let current = root;
			const ancestors: string[] = [];
			for (const part of parts.slice(0, -1)) {
				current = `${current}/${part}`;
				if (current !== root) ancestors.push(current);
			}
			try {
				for (const dir of ancestors) await load(dir);
			} catch {
				return;
			}
			setExpanded((prev) => {
				const next = new Set(prev);
				for (const dir of ancestors) next.add(dir);
				return next;
			});
			setHighlightedPath(target);
			if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
			highlightTimer.current = window.setTimeout(() => {
				setHighlightedPath(null);
				highlightTimer.current = null;
			}, 1500);
			window.setTimeout(() => {
				const row = document.querySelector(`[data-path="${CSS.escape(target)}"]`);
				if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
			}, 0);
		},
		[root, load],
	);

	useEffect(() => {
		if (revealToken === undefined) return;
		void reveal(activePath);
	}, [revealToken, reveal, activePath]);

	useEffect(() => {
		return () => {
			if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
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
				onAction={handleAction}
				onCommitEdit={commitEdit}
				onCancelEdit={() => setEditing(null)}
				editing={editing}
				deleteConfirm={deleteConfirm}
				onConfirmDelete={confirmDelete}
				onCancelDelete={() => setDeleteConfirm(null)}
				changes={changeMap}
			/>
		</div>
	);
}
