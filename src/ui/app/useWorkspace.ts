import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
	type FileEdit,
	type FileEntry,
	type ProjectInfo,
	openProject,
	readTextFile,
	rememberRoot,
} from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";
import { applyFileEdits } from "@/lib/refactor/apply";
import { useTabClose } from "@/ui/app/useTabClose";
import { useFileNavigation } from "@/ui/app/useFileNavigation";
export type Reveal = { line: number; character: number };
export type WorkspaceOptions = {
	onNotice: (message: string | null) => void;
	onProjectOpened: () => void;
	savePaths: (paths: string[]) => Promise<boolean>;
	setRevealTarget: (target: Reveal | null) => void;
	setRevealToken: (updater: (current: number) => number) => void;
	setReferences: (paths: import("@/lib/project/api").Location[]) => void;
	setRefsOpen: (open: boolean) => void;
	setSearchOpen: (open: boolean) => void;
	setQuickOpenOpen: (open: boolean) => void;
};
/**
 * The project and its open buffers.
 *
 * Opening a project resets everything that belonged to the previous one; a tab close asks on the
 * row when the buffer is dirty, so nothing is lost without a decision.
 */
export function useWorkspace(options: WorkspaceOptions) {
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [buffers, setBuffers] = useState<FileBuffer[]>([]);
	const [activePath, setActivePath] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [recentRoots, setRecentRoots] = useState<string[]>([]);
	const [recentFiles, setRecentFiles] = useState<string[]>([]);
	const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set<string>());
	const [confirmClose, setConfirmClose] = useState<string | null>(null);
	const reading = useRef<Set<string>>(new Set());
	const mountedRef = useRef(true);
	useEffect(
		() => () => {
			mountedRef.current = false;
		},
		[],
	);
	const buffersRef = useRef<FileBuffer[]>(buffers);
	buffersRef.current = buffers;
	const activePathRef = useRef<string | null>(activePath);
	activePathRef.current = activePath;
	const openRoot = useCallback(
		async (nextRoot: string) => {
			setOpening(true);
			options.onNotice(null);
			try {
				const next = await openProject(nextRoot);
				setProject(next);
				setBuffers([]);
				setActivePath(null);
				setConfirmClose(null);
				options.onProjectOpened();
				try {
					setRecentRoots(await rememberRoot(nextRoot));
				} catch {
					/* the recents list is a convenience, not a dependency */
				}
			} catch (error) {
				options.onNotice(`Could not open ${nextRoot}: ${describeError(error)}`);
				setRecentRoots((current) => current.filter((entry) => entry !== nextRoot));
			} finally {
				setOpening(false);
			}
		},
		[options],
	);
	const handleOpenProject = useCallback(async () => {
		try {
			const picked = await open({ directory: true, multiple: false, title: "Open project" });
			const nextRoot = typeof picked === "string" ? picked : null;
			if (nextRoot !== null) await openRoot(nextRoot);
		} catch (error) {
			options.onNotice(describeError(error));
		}
	}, [openRoot, options]);
	const openPath = useCallback(
		async (path: string, name: string) => {
			setRecentFiles((current) =>
				[path, ...current.filter((entry) => entry !== path)].slice(0, 20),
			);
			if (buffersRef.current.some((buffer) => buffer.path === path)) {
				setActivePath(path);
				return;
			}
			if (reading.current.has(path)) return;
			reading.current.add(path);
			try {
				const text = await readTextFile(path);
				if (!mountedRef.current) return;
				setBuffers((current) =>
					current.some((buffer) => buffer.path === path)
						? current
						: [...current, { path, name, text, loaded: text }],
				);
				setActivePath(path);
				options.onNotice(null);
			} catch (error) {
				if (mountedRef.current)
					options.onNotice(`Could not open ${name}: ${describeError(error)}`);
			} finally {
				reading.current.delete(path);
			}
		},
		[options],
	);

	const handleOpenFile = useCallback(
		(entry: FileEntry) => {
			options.setRevealTarget(null);
			void openPath(entry.path, entry.name);
		},
		[openPath, options],
	);
	const navigation = useFileNavigation({
		openPath,
		activePathRef,
		setRevealTarget: options.setRevealTarget,
		setRevealToken: options.setRevealToken,
		setSearchOpen: options.setSearchOpen,
		setQuickOpenOpen: options.setQuickOpenOpen,
	});

	const handleChange = useCallback((value: string) => {
		setBuffers((current) =>
			current.map((buffer) =>
				buffer.path === activePathRef.current ? { ...buffer, text: value } : buffer,
			),
		);
	}, []);

	const handleApplyEdits = useCallback(
		async (edits: FileEdit[]) => {
			const result = await applyFileEdits(edits, buffersRef.current, setBuffers);
			if (result.files > 0) options.onNotice(`Renamed ${result.files} files`);
			for (const failed of result.failed) options.onNotice(`Failed: ${failed}`);
			if (result.files === 0 && result.failed.length === 0) {
				options.onNotice("Rename unavailable here");
			}
		},
		[options],
	);

	const tabs = useTabClose({
		buffersRef,
		activePathRef,
		setBuffers,
		setActivePath,
		savePaths: options.savePaths,
		setConfirmClose,
		clearReveal: () => options.setRevealTarget(null),
	});

	return {
		project,
		setProject,
		buffers,
		setBuffers,
		buffersRef,
		activePath,
		setActivePath,
		activePathRef,
		opening,
		recentRoots,
		setRecentRoots,
		recentFiles,
		setRecentFiles,
		saving,
		setSaving,
		confirmClose,
		setConfirmClose,
		openRoot,
		handleOpenProject,
		openPath,
		handleOpenFile,
		handleSelectProblem: navigation.selectProblem,
		handleOpenMatch: navigation.openMatch,
		handleOpenQuick: navigation.openQuick,
		handleNavigate: navigation.navigate,
		handleChange,
		handleApplyEdits,
		handleClose: tabs.close,
		handleSaveClose: tabs.saveClose,
		handleDiscardClose: tabs.discardClose,
		handleCancelClose: tabs.cancelClose,
		handleActivate: tabs.activate,
	};
}
