import { useCallback, useEffect, useRef, useState } from "react";
import { startupMark } from "@/lib/startupMarks";
import { type FileEdit, type ProjectInfo, openProject, rememberRoot } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";
import { applyEditsWithNotice } from "@/ui/app/applyEdits";
import { externalChangeHandler } from "@/ui/app/externalChanges";
import type { DiagnosticsLifecycleEvent } from "@/lib/lsp/lifecycle";
import { useTabClose } from "@/ui/app/useTabClose";
import { useBufferText } from "@/ui/app/useBufferText";
import { followExternalChanges } from "@/ui/app/recentsFollow";
import { useFileOpening } from "@/ui/app/useFileOpening";
import { useFileNavigation } from "@/ui/app/useFileNavigation";
export type Reveal = { line: number; character: number };
export type WorkspaceOptions = {
	onNotice: (message: string | null) => void;
	onProjectOpened: () => void;
	savePaths: (paths: string[]) => Promise<boolean>;
	/** A tab closed, a file moved, or a buffer's text changed: anything keyed by that path follows. */
	onDiagnosticsEvent?: (event: DiagnosticsLifecycleEvent) => void;
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
				// Recents are file paths in the project that was open; keeping them lists another
				// tree's files under this one and stamps them into this project's settings.
				setRecentFiles([]);
				options.onProjectOpened();
				try {
					setRecentRoots(await rememberRoot(nextRoot));
				} catch {
					/* the recents list is a convenience, not a dependency */
				}
				startupMark("project-open");
			} catch (error) {
				options.onNotice(`Could not open ${nextRoot}: ${describeError(error)}`);
				setRecentRoots((current) => current.filter((entry) => entry !== nextRoot));
			} finally {
				setOpening(false);
			}
		},
		[options],
	);
	// Openers live in their own module: this hook is at the file-size limit.
	const { openPath, handleOpenFile, handleOpenProject } = useFileOpening({
		options,
		buffersRef,
		mountedRef,
		reading,
		setBuffers,
		setActivePath,
		setRecentFiles,
		openRoot,
	});

	const navigation = useFileNavigation({
		openPath,
		activePathRef,
		setRevealTarget: options.setRevealTarget,
		setRevealToken: options.setRevealToken,
		setSearchOpen: options.setSearchOpen,
		setQuickOpenOpen: options.setQuickOpenOpen,
	});

	// Typing replaces the one buffer it changed, and a real text change also drops that file's build
	// rows; the same text reported again — an external reload echoing back — leaves both untouched.
	const { handleChange, handleChangeFor } = useBufferText({
		buffers: buffersRef,
		activePath: activePathRef,
		setBuffers,
		onTextChanged: (path) => options.onDiagnosticsEvent?.({ type: "text", path }),
	});

	const handleApplyEdits = useCallback(
		async (edits: FileEdit[]) =>
			applyEditsWithNotice(edits, buffersRef.current, setBuffers, options.onNotice),
		[options],
	);

	// The watcher reports paths; this turns them into buffer text, never touching a dirty one. A
	// close or a move also leaves the recents list and the active tab pointing somewhere real.
	const bufferRefs = { buffers: buffersRef, mounted: mountedRef };
	const follow = followExternalChanges({
		activePath: () => activePathRef.current,
		setActivePath,
		setRecentFiles,
	});
	const applyExternalChanges = externalChangeHandler(
		bufferRefs,
		setBuffers,
		options.onNotice,
		undefined,
		{
			onClosed: (path) => {
				follow.onClosed(path);
				options.onDiagnosticsEvent?.({ type: "close", path });
			},
			onMoved: (from, to) => {
				follow.onMoved(from, to);
				options.onDiagnosticsEvent?.({ type: "rename", from, to });
			},
			onReloaded: (path) => options.onDiagnosticsEvent?.({ type: "text", path }),
		},
	);

	const tabs = useTabClose({
		buffersRef,
		activePathRef,
		setBuffers,
		setActivePath,
		savePaths: options.savePaths,
		setConfirmClose,
		clearReveal: () => options.setRevealTarget(null),
		onClosed: (path) => options.onDiagnosticsEvent?.({ type: "close", path }),
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
		handleChangeFor,
		handleApplyEdits,
		applyExternalChanges,
		handleClose: tabs.close,
		handleSaveClose: tabs.saveClose,
		handleDiscardClose: tabs.discardClose,
		handleCancelClose: tabs.cancelClose,
		handleActivate: tabs.activate,
	};
}
