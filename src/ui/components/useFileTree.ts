import { useCallback, useEffect, useRef, useState } from "react";
import { useReveal } from "./useReveal";
import { type FileEntry, listDir } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { createDir, createFile, deletePath, renamePath } from "@/lib/project/fileOps";
import type { DirState, EditState } from "./FileTreeTypes";

export type FileTreeProps = {
	root: string;
	activePath: string | null;
	onOpenFile: (entry: FileEntry) => void;
	onFileRenamed?: (oldPath: string, newPath: string) => void;
	onFileDeleted?: (path: string) => void;
	onNotice?: (message: string) => void;
	changes?: Record<string, import("@/lib/project/api").GitStatusEntry["status"]>;
	revealToken?: number;
};

export function useFileTree({
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
		if (existing !== undefined) return existing;
		if (settled.current.has(path)) return Promise.resolve();
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
			void load(path).catch((error: unknown) => {
				onNotice?.(`refresh failed: ${describeError(error)}`);
			});
		},
		[load, onNotice],
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
				if (isOpen) next.delete(path);
				else next.add(path);
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

	useReveal(root, activePath, revealToken, load, setExpanded, setHighlightedPath, highlightTimer);

	useEffect(() => {
		return () => {
			if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
		};
	}, []);

	return {
		changeMap,
		dirs,
		expanded,
		highlightedPath,
		editing,
		deleteConfirm,
		load,
		toggle,
		openFile,
		handleAction,
		commitEdit,
		confirmDelete,
		setEditing,
		setDeleteConfirm,
	};
}
