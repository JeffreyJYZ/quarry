import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FileTree from "@/components/FileTree";
import RefsPanel from "@/components/RefsPanel";
import StatusBar from "@/components/StatusBar";
import TabStrip from "@/components/TabStrip";
import Welcome from "@/components/Welcome";
import DebugPanel from "@/debug/DebugPanel";
import { type BreakpointRow, useDebugSession } from "@/debug/session";
import Editor, { type EditorHandle } from "@/editor/Editor";
import DiffView from "@/git/DiffView";
import SourceControl from "@/git/SourceControl";
import {
	combineDiagnostics,
	countSeverities,
	type DiagnosticMap,
	groupDiagnostics,
	withServerDiagnostics,
} from "@/lsp/diagnostics";
import { useDiagnosticsFeed } from "@/lsp/feed";
import { useDocumentSync, useLspServer } from "@/lsp/session";
import Outline from "@/outline/Outline";
import CommandPalette, { type Command } from "@/palette/CommandPalette";
import { fileName, plural, problemFiles } from "@/problems/model";
import {
	buildProject,
	type Diagnostic,
	defaultLaunchConfig,
	type FileEntry,
	type GitStatus,
	gitStatus,
	type Location,
	onRunExited,
	onRunOutput,
	openProject,
	type ProjectInfo,
	readSettings,
	readTextFile,
	runProgram,
	type Settings,
	stopProgram,
	type ToolchainReport,
	toolchains,
	version,
	writeSettings,
} from "@/project/api";
import { type FileBuffer, isDirty } from "@/project/buffer";
import { describeError } from "@/project/errors";
import { type SaveOutcome, saveBuffer, saveErrorMessage, saveMessage } from "@/project/save";
import { applyFileEdits } from "@/refactor/apply";
import RunLog from "@/run/RunLog";
import SearchPalette from "@/search/SearchPalette";
import ShortcutSheet from "@/shortcuts/ShortcutSheet";
import Terminal from "@/terminal/Terminal";
import TestsDock, { type DockTab } from "@/tests/TestsDock";
import { useTests } from "@/tests/useTests";
import "./styles.css";

const NO_BREAKPOINTS: BreakpointRow[] = [];

const SHORTCUT_GROUPS = [
	{
		title: "Project",
		entries: [
			{ keys: ["Cmd", "K"], action: "Toggle shortcut sheet" },
			{ keys: ["?"], action: "Open shortcut sheet (outside editor)" },
		],
	},
	{
		title: "Editing",
		entries: [
			{ keys: ["Cmd", "S"], action: "Save active file" },
			{ keys: ["Cmd", "Alt", "S"], action: "Save all dirty files" },
			{ keys: ["Cmd", "F"], action: "Find in file" },
			{ keys: ["Cmd", "Alt", "F"], action: "Find in project" },
			{ keys: ["Cmd", "G"], action: "Next match" },
			{ keys: ["Cmd", "Alt", "L"], action: "Format active file" },
		],
	},
	{
		title: "Navigation",
		entries: [
			{ keys: ["F12"], action: "Go to definition" },
			{ keys: ["Shift", "F12"], action: "Find references" },
			{ keys: ["Cmd", "Click"], action: "Go to definition" },
		],
	},
	{
		title: "Panels",
		entries: [{ keys: ["Esc"], action: "Close in-file search / sheet" }],
	},
	{
		title: "View",
		entries: [
			{ keys: ["Cmd", "B"], action: "Toggle left rail" },
			{ keys: ["Cmd", "J"], action: "Toggle bottom dock" },
			{ keys: ["Cmd", "Shift", "D"], action: "Toggle debug panel" },
			{ keys: ["Cmd", "Shift", "G"], action: "Toggle source control" },
		],
	},
];

/** How long the transient save line stays in the status bar. */
const SAVE_STATUS_MS = 4000;

/** The transient line the save flow puts in the status bar's `extra` slot. */
type SaveStatus = { text: string; failed: boolean };

export default function App() {
	const [appVersion, setAppVersion] = useState("");
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [gitStatusState, setGitStatusState] = useState<GitStatus | null>(null);
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const [reportFailed, setReportFailed] = useState(false);
	const [buffers, setBuffers] = useState<FileBuffer[]>([]);
	const [activePath, setActivePath] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [serverDiagnostics, setServerDiagnostics] = useState<DiagnosticMap>(() => new Map());
	const [buildDiagnostics, setBuildDiagnostics] = useState<DiagnosticMap>(() => new Map());
	const [buildSummary, setBuildSummary] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);
	const [runId, setRunId] = useState<string | null>(null);
	const [runLines, setRunLines] = useState<{ stream: "stdout" | "stderr"; line: string }[]>([]);
	const [runExited, setRunExited] = useState<{ code: number | null; killed?: boolean } | null>(
		null,
	);
	const runIdRef = useRef<string | null>(null);
	useEffect(() => {
		runIdRef.current = runId;
	}, [runId]);
	const [formatting, setFormatting] = useState(false);
	/** `null` means "follow the default": open when there is an error, collapsed otherwise. */
	const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
	const [dockTab, setDockTab] = useState<DockTab>("problems");
	const [references, setReferences] = useState<Location[]>([]);
	const [revealTarget, setRevealTarget] = useState<{ line: number; character: number } | null>(
		null,
	);
	const [revealToken, setRevealToken] = useState(0);
	const [refsOpen, setRefsOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [recentCommands, setRecentCommands] = useState<string[]>([]);
	const [debugOpen, setDebugOpen] = useState(false);
	const [gitOpen, setGitOpen] = useState(false);
	const [railCollapsed, setRailCollapsed] = useState(false);
	const [gitRefresh, setGitRefresh] = useState(0);
	const [gitDiffPath, setGitDiffPath] = useState<string | null>(null);
	const [terminalOpen, setTerminalOpen] = useState(false);
	/** Paths with a write in flight; the tab row dims its mark while the promise resolves. */
	const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set<string>());
	/** Path whose dirty close is waiting on the inline Save/Discard choice. */
	const [confirmClose, setConfirmClose] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);

	useEffect(() => {
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		let cancelled = false;
		void (async () => {
			try {
				unOutput = await onRunOutput((event) => {
					if (event.runId !== runIdRef.current) {
						return;
					}
					setRunLines((current) => {
						const next = [...current, { stream: event.stream, line: event.line }];
						if (next.length > 2000) {
							return next.slice(next.length - 2000);
						}
						return next;
					});
				});
				unExited = await onRunExited((event) => {
					if (event.runId !== runIdRef.current) {
						return;
					}
					setRunExited({ code: event.code });
					setRunId(null);
				});
			} catch {
				/* ignore */
			}
			if (cancelled) {
				unOutput?.();
				unExited?.();
			}
		})();
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
		};
	}, []);
	const reading = useRef<Set<string>>(new Set());
	/** Mirrors of the live state so the global key handler and the save loop never read a stale run. */
	const buffersRef = useRef<FileBuffer[]>([]);
	const activePathRef = useRef<string | null>(null);
	const editorRef = useRef<EditorHandle | null>(null);
	const saveTimer = useRef<number | null>(null);
	const restoredRef = useRef(false);
	const snapshotRef = useRef<{
		project: ProjectInfo | null;
		buffers: FileBuffer[];
		activePath: string | null;
		railCollapsed: boolean;
		debugOpen: boolean;
		gitOpen: boolean;
		panelOpen: boolean | null;
		dockTab: DockTab;
	}>({
		project: null,
		buffers: [],
		activePath: null,
		railCollapsed: false,
		debugOpen: false,
		gitOpen: false,
		panelOpen: null,
		dockTab: "problems",
	});
	snapshotRef.current = {
		project,
		buffers,
		activePath,
		railCollapsed,
		debugOpen,
		gitOpen,
		panelOpen,
		dockTab,
	};

	useEffect(() => {
		version().then(setAppVersion, () => setAppVersion(""));
		toolchains().then(
			(next) => {
				setReport(next);
				setReportFailed(false);
			},
			() => {
				setReport(null);
				setReportFailed(true);
			},
		);
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await readSettings();
				if (cancelled) return;
				setRailCollapsed(settings.railCollapsed ?? false);
				setDebugOpen(settings.debugOpen ?? false);
				setGitOpen(settings.gitOpen ?? false);
				setPanelOpen(settings.dockExpanded ?? null);
				const storedTab = settings.dockTab;
				setDockTab(
					storedTab === "tests" || storedTab === "problems" ? storedTab : "problems",
				);
				if (settings.lastRoot !== null) {
					try {
						const next = await openProject(settings.lastRoot);
						if (cancelled) return;
						setProject(next);
						setBuffers([]);
						setActivePath(null);
						for (const path of settings.openFiles) {
							if (cancelled) return;
							const name = fileName(path);
							try {
								const text = await readTextFile(path);
								if (cancelled) return;
								setBuffers((current) =>
									current.some((buffer) => buffer.path === path)
										? current
										: [...current, { path, name, text, loaded: text }],
								);
							} catch {
								/* skip unreadable file */
							}
						}
						if (
							settings.activeFile !== null &&
							settings.openFiles.includes(settings.activeFile)
						) {
							setActivePath(settings.activeFile);
						}
					} catch {
						try {
							await writeSettings({
								lastRoot: null,
								openFiles: [],
								activeFile: null,
							});
						} catch {
							/* ignore */
						}
					}
				}
			} catch (error) {
				if (!cancelled) setNotice(describeError(error));
			} finally {
				if (!cancelled) restoredRef.current = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!restoredRef.current) return;
		const timer = window.setTimeout(() => {
			const settings: Settings = {
				lastRoot: project?.root ?? null,
				openFiles: buffers.map((buffer) => buffer.path),
				activeFile: activePath,
				railCollapsed,
				debugOpen,
				gitOpen,
				dockTab,
				dockExpanded: panelOpen,
			};
			void writeSettings(settings).catch((error) => setNotice(describeError(error)));
		}, 400);
		return () => window.clearTimeout(timer);
	}, [project, buffers, activePath, railCollapsed, debugOpen, gitOpen, dockTab, panelOpen]);

	useEffect(() => {
		const flush = () => {
			if (!restoredRef.current) return;
			const snap = snapshotRef.current;
			const settings: Settings = {
				lastRoot: snap.project?.root ?? null,
				openFiles: snap.buffers.map((buffer: FileBuffer) => buffer.path),
				activeFile: snap.activePath,
				railCollapsed: snap.railCollapsed,
				debugOpen: snap.debugOpen,
				gitOpen: snap.gitOpen,
				dockTab: snap.dockTab as Settings["dockTab"],
				dockExpanded: snap.panelOpen,
			};
			void writeSettings(settings).catch((error) => setNotice(describeError(error)));
		};
		const handleVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, []);

	const root = project?.root ?? null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: gitRefresh is an explicit refresh trigger
	useEffect(() => {
		let cancelled = false;
		if (root === null) {
			setGitStatusState(null);
			return;
		}
		void (async () => {
			try {
				const next = await gitStatus(root);
				if (!cancelled) setGitStatusState(next);
			} catch {
				if (!cancelled) setGitStatusState(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [root, gitRefresh]);

	useEffect(() => {
		const handleFocus = () => {
			if (root !== null) {
				setGitRefresh((current) => current + 1);
			}
		};
		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [root]);

	const tests = useTests(root);
	const active = buffers.find((buffer) => buffer.path === activePath) ?? null;

	useEffect(() => {
		buffersRef.current = buffers;
	}, [buffers]);
	useEffect(() => {
		activePathRef.current = activePath;
	}, [activePath]);

	const showSaveStatus = useCallback((status: SaveStatus) => {
		setSaveStatus(status);
		if (saveTimer.current !== null) {
			window.clearTimeout(saveTimer.current);
		}
		saveTimer.current = window.setTimeout(() => {
			saveTimer.current = null;
			setSaveStatus(null);
		}, SAVE_STATUS_MS);
	}, []);

	useEffect(
		() => () => {
			if (saveTimer.current !== null) {
				window.clearTimeout(saveTimer.current);
				saveTimer.current = null;
			}
		},
		[],
	);

	/** Writes the paths in order, stopping at the first failure; the failed row reports itself. */
	const savePaths = useCallback(
		async (paths: string[]): Promise<boolean> => {
			if (root === null) {
				return false;
			}
			let saved = 0;
			let warned = false;
			for (const path of paths) {
				const buffer = buffersRef.current.find((entry) => entry.path === path);
				if (!buffer) {
					continue;
				}
				setSaving((current) => new Set(current).add(path));
				try {
					let outcome: SaveOutcome;
					try {
						outcome = await saveBuffer(root, buffer);
					} catch (error) {
						showSaveStatus({
							text: saveErrorMessage(buffer.name, error),
							failed: true,
						});
						return false;
					}
					const written = outcome.buffer;
					setBuffers((current) =>
						current.map((entry) => (entry.path === path ? written : entry)),
					);
					saved += 1;
					if (outcome.warning !== null) {
						warned = true;
					}
					showSaveStatus({
						text: saveMessage(written.name, outcome.warning),
						failed: false,
					});
				} finally {
					setSaving((current) => {
						const next = new Set(current);
						next.delete(path);
						return next;
					});
				}
			}
			if (saved > 1 && !warned) {
				showSaveStatus({ text: `Saved ${saved} files`, failed: false });
			}
			return saved === paths.length;
		},
		[root, showSaveStatus],
	);

	const saveActive = useCallback(() => {
		const path = activePathRef.current;
		return savePaths(path === null ? [] : [path]);
	}, [savePaths]);

	const saveAll = useCallback(
		() =>
			savePaths(
				buffersRef.current.filter((buffer) => isDirty(buffer)).map((buffer) => buffer.path),
			),
		[savePaths],
	);

	const formatActive = useCallback(async () => {
		if (root === null || activePath === null || formatting) {
			return;
		}
		setFormatting(true);
		try {
			await editorRef.current?.format();
		} finally {
			setFormatting(false);
		}
	}, [root, activePath, formatting]);

	const reportNotice = useCallback((message: string) => setNotice(message), []);
	const lsp = useLspServer(root, reportNotice);
	const debug = useDebugSession(root);

	/* Breakpoints live in the debug session, keyed by absolute path, so a tab switch or a gutter
	 * click with no live session both render straight from that map. */
	const activeBreakpoints = useMemo(
		() =>
			activePath === null
				? NO_BREAKPOINTS
				: (debug.breakpointsByPath.get(activePath) ?? NO_BREAKPOINTS),
		[activePath, debug.breakpointsByPath],
	);
	const breakpointLines = useMemo(
		() => activeBreakpoints.map((row) => row.line),
		[activeBreakpoints],
	);
	const unverifiedLines = useMemo(
		() => activeBreakpoints.filter((row) => row.verified === false).map((row) => row.line),
		[activeBreakpoints],
	);
	const toggleBreakpoint = debug.toggleBreakpoint;
	const handleToggleBreakpoint = useCallback(
		(line: number) => {
			if (activePath === null) return;
			toggleBreakpoint(activePath, line);
		},
		[activePath, toggleBreakpoint],
	);

	const handlePublish = useCallback((path: string, diagnostics: Diagnostic[]) => {
		setServerDiagnostics((current) => withServerDiagnostics(current, path, diagnostics));
	}, []);
	useDiagnosticsFeed({ root, onPublish: handlePublish, onError: reportNotice });

	useDocumentSync({
		root,
		path: active?.path ?? null,
		text: active?.text ?? "",
		report: reportNotice,
	});

	const diagnostics = useMemo(
		() => combineDiagnostics(serverDiagnostics, buildDiagnostics),
		[serverDiagnostics, buildDiagnostics],
	);
	const counts = useMemo(() => countSeverities(diagnostics), [diagnostics]);
	const files = useMemo(() => problemFiles(diagnostics), [diagnostics]);
	const panelExpanded = panelOpen ?? counts.errors > 0;

	const previousErrors = useRef(counts.errors);
	useEffect(() => {
		if (counts.errors > 0 && previousErrors.current === 0) {
			setPanelOpen(null);
		}
		previousErrors.current = counts.errors;
	}, [counts.errors]);

	const handleOpenProject = useCallback(async () => {
		setOpening(true);
		setNotice(null);
		try {
			const picked = await open({
				directory: true,
				multiple: false,
				title: "Open project",
			});
			const nextRoot = typeof picked === "string" ? picked : null;
			if (!nextRoot) {
				return;
			}
			const next = await openProject(nextRoot);
			setProject(next);
			setBuffers([]);
			setActivePath(null);
			setGitRefresh((current) => current + 1);
			setGitDiffPath(null);
			setConfirmClose(null);
			setSaveStatus(null);
			setServerDiagnostics(new Map());
			setBuildDiagnostics(new Map());
			setBuildSummary(null);
			setPanelOpen(null);
			setSearchOpen(false);
			setShortcutsOpen(false);
			setDebugOpen(false);
		} catch (error) {
			setNotice(describeError(error));
		} finally {
			setOpening(false);
		}
	}, []);

	/** `Cmd+S` saves, `Cmd+Alt+S` saves everything, `Cmd+F` opens the palette outside the editor. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey) {
				return;
			}
			const key = event.key.toLowerCase();
			if (key === "s" && !event.shiftKey) {
				/* Swallowed unconditionally: the webview must never raise its own save dialog. */
				event.preventDefault();
				if (event.altKey) {
					void saveAll();
				} else {
					void saveActive();
				}
				return;
			}
			if (key === "l" && event.altKey && root !== null && activePath !== null) {
				event.preventDefault();
				void formatActive();
				return;
			}
			if (event.altKey || event.shiftKey || key !== "f" || root === null) {
				return;
			}
			const focused = document.activeElement;
			if (focused instanceof Element && focused.closest(".cm-editor") !== null) {
				return;
			}
			event.preventDefault();
			setSearchOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root, saveActive, saveAll, formatActive, activePath]);

	/** Cmd+K toggles the shortcut sheet; `?` opens it when focus is outside the editor and any input. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
				const key = event.key.toLowerCase();
				if (key === "k") {
					event.preventDefault();
					setShortcutsOpen((current) => !current);
					return;
				}
			}
			if (
				event.key === "?" &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!event.shiftKey
			) {
				const focused = document.activeElement;
				if (focused instanceof Element && focused.closest(".cm-editor") !== null) {
					return;
				}
				if (
					focused instanceof HTMLInputElement ||
					focused instanceof HTMLTextAreaElement ||
					(focused instanceof HTMLElement && focused.isContentEditable)
				) {
					return;
				}
				event.preventDefault();
				setShortcutsOpen(true);
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	/** Layout toggles: Cmd+B rail, Cmd+J dock, Cmd+Shift+D debug, Cmd+Shift+G git. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			const focused = document.activeElement;
			if (focused instanceof Element && focused.closest(".cm-editor") !== null) {
				return;
			}
			if (
				focused instanceof HTMLInputElement ||
				focused instanceof HTMLTextAreaElement ||
				(focused instanceof HTMLElement && focused.isContentEditable)
			) {
				return;
			}
			const key = event.key.toLowerCase();
			if (!event.shiftKey) {
				if (key === "b") {
					event.preventDefault();
					setRailCollapsed((current) => !current);
					return;
				}
				if (key === "j") {
					event.preventDefault();
					setPanelOpen(!panelExpanded);
					return;
				}
				return;
			}
			if (key === "d") {
				event.preventDefault();
				setDebugOpen((current) => !current);
				return;
			}
			if (key === "g") {
				event.preventDefault();
				setGitOpen((current) => !current);
				return;
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [panelExpanded]);

	/** Cmd+Shift+P opens the command palette. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) {
				return;
			}
			if (event.key.toLowerCase() !== "p") {
				return;
			}
			event.preventDefault();
			setCommandPaletteOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	const openPath = useCallback(
		async (path: string, name: string) => {
			if (buffers.some((buffer) => buffer.path === path)) {
				setActivePath(path);
				return;
			}
			if (reading.current.has(path)) {
				return;
			}
			reading.current.add(path);
			try {
				const text = await readTextFile(path);
				setBuffers((current) =>
					current.some((buffer) => buffer.path === path)
						? current
						: [...current, { path, name, text, loaded: text }],
				);
				setActivePath(path);
				setNotice(null);
			} catch (error) {
				setNotice(`Could not open ${name}: ${describeError(error)}`);
			} finally {
				reading.current.delete(path);
			}
		},
		[buffers],
	);

	const handleOpenFile = useCallback(
		(entry: FileEntry) => {
			setRevealTarget(null);
			void openPath(entry.path, entry.name);
		},
		[openPath],
	);

	const handleSelectProblem = useCallback(
		(path: string, line?: number, character?: number) => {
			if (line === undefined || character === undefined) {
				void openPath(path, fileName(path));
				return;
			}
			void openPath(path, fileName(path));
			setRevealTarget({ line, character });
			setRevealToken((current) => current + 1);
		},
		[openPath],
	);

	/** A search row reuses the file-tree flow; the already-active tab needs no second open. */
	const handleOpenMatch = useCallback(
		(path: string) => {
			setSearchOpen(false);
			if (path === activePath) {
				return;
			}
			void openPath(path, fileName(path));
		},
		[activePath, openPath],
	);

	const closeSearch = useCallback(() => setSearchOpen(false), []);

	const handleNavigate = useCallback(
		(path: string, line: number, character: number) => {
			void openPath(path, fileName(path));
			setRevealTarget({ line, character });
			setRevealToken((current) => current + 1);
		},
		[openPath],
	);

	const handleReferences = useCallback((locations: Location[]) => {
		setReferences(locations);
		setRefsOpen(true);
	}, []);

	const handleChange = useCallback(
		(value: string) => {
			setBuffers((current) =>
				current.map((buffer) =>
					buffer.path === activePath ? { ...buffer, text: value } : buffer,
				),
			);
		},
		[activePath],
	);

	const handleApplyEdits = useCallback(async (edits: import("@/project/api").FileEdit[]) => {
		const result = await applyFileEdits(edits, buffersRef.current, setBuffers);
		if (result.files > 0) {
			setNotice(`Renamed ${result.files} files`);
		}
		for (const failed of result.failed) {
			setNotice(`Failed: ${failed}`);
		}
		if (result.files === 0 && result.failed.length === 0) {
			setNotice("Rename unavailable here");
		}
	}, []);

	const closeNow = useCallback(
		(path: string) => {
			const index = buffers.findIndex((buffer) => buffer.path === path);
			if (index === -1) {
				return;
			}
			const remaining = buffers.filter((buffer) => buffer.path !== path);
			setBuffers(remaining);
			if (activePath === path) {
				const neighbour = remaining[index] ?? remaining[index - 1] ?? null;
				setActivePath(neighbour ? neighbour.path : null);
			}
		},
		[buffers, activePath],
	);

	/** A clean tab closes at once; a dirty one asks inline on its own row before anything is lost. */
	const handleClose = useCallback(
		(path: string) => {
			const buffer = buffers.find((entry) => entry.path === path);
			if (!buffer) {
				return;
			}
			if (!isDirty(buffer)) {
				closeNow(path);
				return;
			}
			setConfirmClose(path);
		},
		[buffers, closeNow],
	);

	/** Saving from the inline prompt writes first, then closes, so a failed write keeps the tab. */
	const handleSaveClose = useCallback(
		async (path: string) => {
			const ok = await savePaths([path]);
			setConfirmClose(null);
			if (ok) {
				closeNow(path);
			}
		},
		[savePaths, closeNow],
	);

	const handleDiscardClose = useCallback(
		(path: string) => {
			setConfirmClose(null);
			closeNow(path);
		},
		[closeNow],
	);

	const handleCancelClose = useCallback(() => setConfirmClose(null), []);

	/** Switching tabs abandons a pending close, so no row keeps asking about a buffer it lost. */
	const handleActivate = useCallback((path: string) => {
		setConfirmClose(null);
		setRevealTarget(null);
		setActivePath(path);
	}, []);

	const handleRun = useCallback(async () => {
		if (root === null || runId !== null) {
			return;
		}
		setRunLines([]);
		setRunExited(null);
		try {
			const config = await defaultLaunchConfig(root, false);
			const id = await runProgram(config.program, config.args, config.cwd);
			setRunId(id);
		} catch (error) {
			setNotice(describeError(error));
		}
	}, [root, runId]);

	const handleStop = useCallback(async () => {
		const id = runId;
		if (id === null) {
			return;
		}
		try {
			await stopProgram(id);
		} catch (error) {
			setNotice(describeError(error));
		}
		setRunExited((current) => (current === null ? { code: null, killed: true } : current));
		setRunId(null);
	}, [runId]);

	const handleBuild = useCallback(async () => {
		if (root === null || building) {
			return;
		}
		setBuilding(true);
		try {
			const result = await buildProject(root, "debug");
			setBuildDiagnostics(groupDiagnostics(result.diagnostics));
			setBuildSummary(result.summary);
		} catch (error) {
			setNotice(`Build failed: ${describeError(error)}`);
		} finally {
			setBuilding(false);
		}
	}, [root, building]);

	const commands: Command[] = [
		{
			id: "open-project",
			label: "Open project",
			hint: "",
			run: () => {
				void handleOpenProject();
			},
		},
		{
			id: "build",
			label: "Build",
			hint: "",
			disabled: root === null || building,
			run: () => {
				void handleBuild();
			},
		},
		{
			id: "run",
			label: "Run",
			hint: "",
			disabled: root === null || runId !== null,
			run: () => {
				void handleRun();
			},
		},
		{
			id: "stop-run",
			label: "Stop run",
			hint: "",
			disabled: runId === null,
			run: () => {
				void handleStop();
			},
		},
		{
			id: "toggle-debug",
			label: "Toggle debug panel",
			hint: "",
			disabled: root === null,
			run: () => setDebugOpen((current) => !current),
		},
		{
			id: "toggle-source-control",
			label: "Toggle source control",
			hint: "",
			disabled: root === null,
			run: () => setGitOpen((current) => !current),
		},
		{
			id: "save",
			label: "Save",
			hint: "Cmd+S",
			disabled: root === null || activePath === null,
			run: () => {
				void saveActive();
			},
		},
		{
			id: "save-all",
			label: "Save all",
			hint: "Cmd+Alt+S",
			disabled: root === null,
			run: () => {
				void saveAll();
			},
		},
		{
			id: "format",
			label: "Format file",
			hint: "Cmd+Alt+L",
			disabled: root === null || activePath === null || formatting,
			run: () => {
				void formatActive();
			},
		},
		{
			id: "find-in-project",
			label: "Find in project",
			hint: "Cmd+Alt+F",
			disabled: root === null,
			run: () => setSearchOpen(true),
		},
		{
			id: "toggle-rail",
			label: "Toggle rail",
			hint: "Cmd+B",
			run: () => setRailCollapsed((current) => !current),
		},
		{
			id: "toggle-dock",
			label: "Toggle dock",
			hint: "Cmd+J",
			run: () => setPanelOpen(!panelExpanded),
		},
		{
			id: "show-shortcuts",
			label: "Show shortcuts",
			hint: "Cmd+K",
			run: () => setShortcutsOpen(true),
		},
		{
			id: "refresh-git",
			label: "Refresh git",
			hint: "",
			disabled: root === null,
			run: () => setGitRefresh((current) => current + 1),
		},
	];

	const serverLabel =
		lsp === null
			? root === null
				? "no project"
				: "starting"
			: lsp.version === null
				? lsp.server
				: `${lsp.server} ${lsp.version}`;

	return (
		<div className="shell">
			<header className="titlebar" data-tauri-drag-region="">
				<span className="wordmark">quarry</span>
				<button
					type="button"
					className="button"
					disabled={opening}
					onClick={handleOpenProject}
				>
					{opening ? "Opening" : "Open project"}
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null || building}
					onClick={handleBuild}
				>
					{building ? "Building…" : "Build"}
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null}
					onClick={() => {
						if (runId !== null) {
							void handleStop();
						} else {
							void handleRun();
						}
					}}
				>
					{runId !== null ? "Stop" : "Run"}
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null || activePath === null || formatting}
					onClick={() => void formatActive()}
				>
					{formatting ? "Formatting…" : "Format"}
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null}
					aria-pressed={gitOpen}
					onClick={() => setGitOpen((current) => !current)}
				>
					Git
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null}
					aria-pressed={debugOpen && root !== null}
					onClick={() => setDebugOpen((current) => !current)}
				>
					Debug
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null}
					aria-pressed={panelExpanded && dockTab === "tests"}
					onClick={() => {
						setDockTab("tests");
						setPanelOpen(true);
					}}
				>
					Tests
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null}
					aria-pressed={terminalOpen}
					onClick={() => {
						setTerminalOpen((current) => !current);
						if (!terminalOpen) setPanelOpen(true);
					}}
				>
					Terminal
				</button>
				<span className="crumbs" title={project ? project.root : undefined}>
					{project ? project.root : "no project open"}
				</span>
			</header>

			{notice ? (
				<div className="notice" role="status">
					<span className="notice-text" title={notice}>
						{notice}
					</span>
					<button type="button" className="notice-close" onClick={() => setNotice(null)}>
						dismiss
					</button>
				</div>
			) : null}

			<div
				className={[
					"body",
					debugOpen && root !== null ? "debug-open" : "",
					railCollapsed ? "rail-collapsed" : "",
				]
					.filter(Boolean)
					.join(" ")}
			>
				{gitOpen && root !== null ? (
					<SourceControl
						root={root}
						refreshToken={gitRefresh}
						onOpenFile={(path) => void openPath(path, fileName(path))}
						onDiff={setGitDiffPath}
					/>
				) : (
					<aside className="rail">
						<div className="rail-head">
							<span className="label">explorer</span>
						</div>
						{project ? (
							<>
								<FileTree
									key={project.root}
									root={project.root}
									activePath={activePath}
									onOpenFile={handleOpenFile}
								/>
								<Outline
									root={project.root}
									activePath={activePath}
									onNavigate={handleNavigate}
								/>
							</>
						) : (
							<p className="empty">No folder open. Use Open project to choose one.</p>
						)}
					</aside>
				)}

				<main className="canvas">
					{active ? (
						<>
							<TabStrip
								buffers={buffers}
								activePath={activePath}
								saving={saving}
								confirmClose={confirmClose}
								onActivate={handleActivate}
								onClose={handleClose}
								onSaveClose={handleSaveClose}
								onDiscardClose={handleDiscardClose}
								onCancelClose={handleCancelClose}
							/>
							<div className="editor-pane">
								<Editor
									ref={editorRef}
									path={active.path}
									value={active.text}
									onChange={handleChange}
									root={root}
									onNotice={setNotice}
									diagnostics={diagnostics.get(active.path)}
									breakpointLines={breakpointLines}
									unverifiedLines={unverifiedLines}
									onToggleBreakpoint={handleToggleBreakpoint}
									onNavigate={handleNavigate}
									onReferences={handleReferences}
									onApplyEdits={handleApplyEdits}
									reveal={
										revealTarget === null
											? null
											: { ...revealTarget, token: revealToken }
									}
								/>
							</div>
						</>
					) : (
						<Welcome project={project} />
					)}
					{project && terminalOpen ? (
						<Terminal key={project.root} root={project.root} />
					) : project ? (
						<TestsDock
							tab={dockTab}
							expanded={panelExpanded}
							onToggleExpanded={() => setPanelOpen(!panelExpanded)}
							onSelectTab={setDockTab}
							problems={{
								files,
								errors: counts.errors,
								warnings: counts.warnings,
								activePath,
								onSelect: handleSelectProblem,
							}}
							tests={tests}
						/>
					) : null}
					{runId !== null || runLines.length > 0 || runExited !== null ? (
						<RunLog
							lines={runLines}
							exited={runExited}
							onClear={() => {
								setRunLines([]);
								setRunExited(null);
							}}
						/>
					) : null}
					{searchOpen && root !== null ? (
						<SearchPalette root={root} onOpen={handleOpenMatch} onClose={closeSearch} />
					) : null}
					{shortcutsOpen ? (
						<ShortcutSheet
							groups={SHORTCUT_GROUPS}
							onClose={() => setShortcutsOpen(false)}
						/>
					) : null}
					<CommandPalette
						open={commandPaletteOpen}
						commands={commands}
						recent={recentCommands}
						onRecent={setRecentCommands}
						onClose={() => setCommandPaletteOpen(false)}
					/>
				</main>

				{debugOpen && root !== null ? <DebugPanel debug={debug} /> : null}
			</div>

			{refsOpen ? (
				<RefsPanel
					locations={references}
					onNavigate={handleNavigate}
					onClose={() => setRefsOpen(false)}
				/>
			) : null}
			{gitDiffPath !== null && root !== null ? (
				<DiffView root={root} path={gitDiffPath} onClose={() => setGitDiffPath(null)} />
			) : null}
			<StatusBar
				version={appVersion}
				project={project}
				report={report}
				reportFailed={reportFailed}
				git={gitStatusState}
				extra={
					<>
						{saveStatus === null ? null : (
							<>
								<span
									className={
										saveStatus.failed ? "status-save error" : "status-save"
									}
									title={saveStatus.text}
								>
									{saveStatus.text}
								</span>
								<span className="sep">·</span>
							</>
						)}
						<span className="label">lsp</span>
						<span className="status-server" title={lsp?.root}>
							{serverLabel}
						</span>
						<span className="sep">·</span>
						<span className={counts.errors > 0 ? "count error" : "count"}>
							{plural(counts.errors, "error")}
						</span>
						<span className="sep">·</span>
						<span className={counts.warnings > 0 ? "count warning" : "count"}>
							{plural(counts.warnings, "warning")}
						</span>
						{buildSummary === null ? null : (
							<>
								<span className="sep">·</span>
								<span className="status-build" title={buildSummary}>
									{buildSummary}
								</span>
							</>
						)}
					</>
				}
			/>
		</div>
	);
}
