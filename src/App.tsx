import { open } from "@tauri-apps/plugin-dialog";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Breadcrumb from "@/breadcrumb/Breadcrumb";
import CallsPanel from "@/calls/CallsPanel";
import FileTree from "@/components/FileTree";
import RefsPanel from "@/components/RefsPanel";
import StatusBar from "@/components/StatusBar";
import TabStrip from "@/components/TabStrip";
import Welcome from "@/components/Welcome";
import { type BreakpointRow, useDebugSession } from "@/debug/session";

import type { EditorHandle } from "@/editor/Editor";
import LazyEditor from "@/editor/LazyEditor";
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
import type { Command } from "@/palette/CommandPalette";

import { fileName, plural, problemFiles } from "@/problems/model";
import {
	buildProject,
	type Diagnostic,
	defaultLaunchConfig,
	type FileEntry,
	type GitStatus,
	gitBlame,
	gitStatus,
	type Location,
	onRunExited,
	onRunOutput,
	openProject,
	type ProjectInfo,
	readSettings,
	readTextFile,
	rememberRoot,
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
import RecentProjects from "@/projects/RecentProjects";

import { applyFileEdits } from "@/refactor/apply";
import RunForm from "@/run/RunForm";
import RunLog from "@/run/RunLog";
import { splitArgs } from "@/run/splitArgs";

import ShortcutSheet from "@/shortcuts/ShortcutSheet";

import TestsDock, { type DockTab } from "@/tests/TestsDock";
import { useTests } from "@/tests/useTests";
import "./styles.css";

const DebugPanel = lazy(() => import("@/debug/DebugPanel"));
const CommandPalette = lazy(() => import("@/palette/CommandPalette"));
const QuickOpen = lazy(() => import("@/quickopen/QuickOpen"));
const SearchPalette = lazy(() => import("@/search/SearchPalette"));
const Terminal = lazy(() => import("@/terminal/Terminal"));

const NO_BREAKPOINTS: BreakpointRow[] = [];

const SHORTCUT_GROUPS = [
	{
		title: "Project",
		entries: [
			{ keys: ["Cmd", "K"], action: "Toggle shortcut sheet" },
			{ keys: ["Cmd", "Shift", "P"], action: "Open command palette" },
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
			{ keys: ["Cmd", "P"], action: "Quick open by file name" },
			{ keys: ["Cmd", "Shift", "E"], action: "Reveal active file in explorer" },
			{ keys: ["F12"], action: "Go to definition" },
			{ keys: ["Shift", "F12"], action: "Find references" },
			{ keys: ["Cmd", "Click"], action: "Go to definition" },
		],
	},
	{
		title: "Debug",
		entries: [{ keys: ["Cmd", "F10"], action: "Run to cursor" }],
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
	const [runProgramState, setRunProgramState] = useState("");
	const [runArgsState, setRunArgsState] = useState("");
	const [runCwdState, setRunCwdState] = useState("");
	const [runEnvState, setRunEnvState] = useState<import("@/project/api").EnvVar[]>([]);
	const runFormMemory = useRef<
		Map<string, { args: string; cwd: string; env: import("@/project/api").EnvVar[] }>
	>(new Map());
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
	const [callsOpen, setCallsOpen] = useState(false);
	const [callsCursor, setCallsCursor] = useState<{ line: number; character: number } | null>(
		null,
	);
	const [cursor, setCursor] = useState<{ line: number; character: number } | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [recentCommands, setRecentCommands] = useState<string[]>([]);
	const [debugOpen, setDebugOpen] = useState(false);
	const [gitOpen, setGitOpen] = useState(false);
	const [railCollapsed, setRailCollapsed] = useState(false);
	const [fileRevealToken, setFileRevealToken] = useState(0);
	const [gitRefresh, setGitRefresh] = useState(0);
	const [blameSaveToken, setBlameSaveToken] = useState(0);
	const [blameOn, setBlameOn] = useState(false);
	const [blameByPath, setBlameByPath] = useState<Map<string, { line: number; label: string }[]>>(
		new Map(),
	);
	const [gitDiffPath, setGitDiffPath] = useState<string | null>(null);
	const [gitCommitDiffHash, setGitCommitDiffHash] = useState<string | null>(null);
	const [terminalOpen, setTerminalOpen] = useState(false);
	/** Paths with a write in flight; the tab row dims its mark while the promise resolves. */
	const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set<string>());
	/** Path whose dirty close is waiting on the inline Save/Discard choice. */
	const [confirmClose, setConfirmClose] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
	const [recentRoots, setRecentRoots] = useState<string[]>([]);

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
				setRecentRoots(settings.recentRoots ?? []);
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

	useEffect(() => {
		if (root === null) {
			return;
		}
		const saved = runFormMemory.current.get(root);
		void defaultLaunchConfig(root, false)
			.then((config) => {
				setRunProgramState(config.program);
				if (saved === undefined) {
					setRunArgsState(config.args.join(" "));
					setRunCwdState(config.cwd);
					setRunEnvState([]);
				} else {
					setRunArgsState(saved.args);
					setRunCwdState(saved.cwd);
					setRunEnvState(saved.env ?? []);
				}
			})
			.catch(() => {
				/* ignore */
			});
	}, [root]);

	useEffect(() => {
		if (root === null) {
			return;
		}
		runFormMemory.current.set(root, { args: runArgsState, cwd: runCwdState, env: runEnvState });
	}, [root, runArgsState, runCwdState, runEnvState]);

	const gitInFlight = useRef<Promise<void> | null>(null);
	const gitFollowup = useRef(false);
	const refreshGit = useCallback(async () => {
		if (root === null) {
			setGitStatusState(null);
			return;
		}
		if (gitInFlight.current !== null) {
			gitFollowup.current = true;
			return gitInFlight.current;
		}
		const run = async () => {
			do {
				gitFollowup.current = false;
				const next = await gitStatus(root);
				setGitStatusState(next);
			} while (gitFollowup.current);
		};
		const promise = run()
			.catch((error) => {
				throw error;
			})
			.finally(() => {
				gitInFlight.current = null;
			});
		gitInFlight.current = promise;
		return promise;
	}, [root]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: gitRefresh is an explicit refresh trigger
	useEffect(() => {
		void refreshGit().catch(() => {
			/* failures surface through callers that await refreshGit */
		});
	}, [root, gitRefresh, refreshGit]);

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

	/* Editor blame annotations: fetched only while the toggle is on, cached per path. */
	useEffect(() => {
		if (!blameOn || root === null || activePath === null) return;
		if (blameByPath.has(activePath)) return;
		let cancelled = false;
		gitBlame(root, activePath)
			.then((rows) => {
				if (cancelled) return;
				const annotations = rows.map((row) => ({
					line: row.line,
					label: `${row.hash} · ${row.author}`,
				}));
				setBlameByPath((current) => new Map(current).set(activePath, annotations));
			})
			.catch(() => {
				if (!cancelled) setBlameOn(false);
			});
		return () => {
			cancelled = true;
		};
	}, [blameOn, root, activePath, blameByPath]);
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
					setBlameByPath((current) => {
						if (!current.has(path)) return current;
						const next = new Map(current);
						next.delete(path);
						return next;
					});
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
			if (saved > 0) {
				setBlameSaveToken((current) => current + 1);
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

	const openRoot = useCallback(async (nextRoot: string) => {
		setOpening(true);
		setNotice(null);
		try {
			const next = await openProject(nextRoot);
			setProject(next);
			setBuffers([]);
			setActivePath(null);
			setGitRefresh((current) => current + 1);
			setGitDiffPath(null);
			setGitCommitDiffHash(null);
			setConfirmClose(null);
			setSaveStatus(null);
			setServerDiagnostics(new Map());
			setBuildDiagnostics(new Map());
			setBuildSummary(null);
			setPanelOpen(null);
			setSearchOpen(false);
			setShortcutsOpen(false);
			setDebugOpen(false);
			try {
				const updated = await rememberRoot(nextRoot);
				setRecentRoots(updated);
			} catch {
				/* ignore */
			}
		} catch (error) {
			setNotice(`Could not open ${nextRoot}: ${describeError(error)}`);
			setRecentRoots((current) => current.filter((entry) => entry !== nextRoot));
		} finally {
			setOpening(false);
		}
	}, []);

	const handleOpenProject = useCallback(async () => {
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
			await openRoot(nextRoot);
		} catch (error) {
			setNotice(describeError(error));
		}
	}, [openRoot]);

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

	/** Cmd+Shift+E reveals the active file in the explorer. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) {
				return;
			}
			if (event.key.toLowerCase() !== "e") {
				return;
			}
			if (root === null || activePath === null) {
				return;
			}
			event.preventDefault();
			setFileRevealToken((current) => current + 1);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root, activePath]);

	/** Cmd+P opens quick open by file name. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
				return;
			}
			if (event.key.toLowerCase() !== "p") {
				return;
			}
			if (root === null) {
				return;
			}
			event.preventDefault();
			setQuickOpenOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root]);

	/** Cmd+F10 runs to the caret line. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
				return;
			}
			if (event.key !== "F10") {
				return;
			}
			if (activePathRef.current === null || cursor === null) {
				return;
			}
			event.preventDefault();
			debug.runToCursor(activePathRef.current, cursor.line + 1);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [cursor, debug]);

	/** Shift+Alt+H opens call hierarchy panel. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.shiftKey || !event.altKey || event.metaKey || event.ctrlKey) return;
			if (event.key.toLowerCase() !== "h") return;
			event.preventDefault();
			setCallsCursor(cursor);
			setCallsOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [cursor]);

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

	const handleOpenQuick = useCallback(
		(path: string) => {
			setQuickOpenOpen(false);
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
		if (root === null || runId !== null || runProgramState === "") {
			return;
		}
		if (!runCwdState.startsWith("/")) {
			setNotice("cwd must be absolute");
			return;
		}
		setRunLines([]);
		setRunExited(null);
		try {
			const id = await runProgram(
				runProgramState,
				splitArgs(runArgsState),
				runCwdState,
				runEnvState.length === 0 ? undefined : runEnvState,
			);
			setRunId(id);
		} catch (error) {
			setNotice(describeError(error));
		}
	}, [root, runId, runProgramState, runArgsState, runCwdState, runEnvState]);

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
			id: "toggle-terminal",
			label: "Toggle terminal",
			hint: "",
			disabled: root === null,
			run: () => {
				setTerminalOpen((current) => {
					if (!current) setPanelOpen(true);
					return !current;
				});
			},
		},
		{
			id: "reveal-active-file",
			label: "Reveal active file in explorer",
			hint: "Cmd+Shift+E",
			disabled: root === null || activePath === null,
			run: () => setFileRevealToken((current) => current + 1),
		},
		{
			id: "quick-open",
			label: "Quick open",
			hint: "Cmd+P",
			disabled: root === null,
			run: () => setQuickOpenOpen(true),
		},
		{
			id: "run-to-cursor",
			label: "Run to cursor",
			hint: "Cmd+F10",
			disabled: activePath === null || cursor === null,
			run: () => {
				if (activePathRef.current !== null && cursor !== null) {
					debug.runToCursor(activePathRef.current, cursor.line + 1);
				}
			},
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
		{
			id: "toggle-blame",
			label: "Toggle blame annotations",
			hint: "",
			disabled: root === null || activePath === null,
			run: () => setBlameOn((current) => !current),
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
				<RecentProjects
					roots={recentRoots}
					current={root}
					opening={opening}
					onOpen={(rootToOpen) => void openRoot(rootToOpen)}
				/>
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
					disabled={root === null || activePath === null}
					aria-pressed={blameOn}
					onClick={() => setBlameOn((current) => !current)}
				>
					Blame
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
						status={gitStatusState}
						activePath={activePath}
						saveToken={blameSaveToken}
						onRefresh={refreshGit}
						onOpenFile={(path) => void openPath(path, fileName(path))}
						onDiff={setGitDiffPath}
						onCommitDiff={setGitCommitDiffHash}
						onNavigate={handleNavigate}
						diffPath={gitDiffPath}
					/>
				) : (
					<aside className="rail">
						<div className="rail-head">
							<span className="label">explorer</span>
							<button
								type="button"
								className="button"
								disabled={root === null || activePath === null}
								onClick={() => setFileRevealToken((current) => current + 1)}
							>
								Reveal
							</button>
						</div>
						{project ? (
							<>
								<FileTree
									key={project.root}
									root={project.root}
									activePath={activePath}
									onOpenFile={handleOpenFile}
									revealToken={fileRevealToken}
									changes={Object.fromEntries(
										(gitStatusState?.entries ?? []).map((entry) => [
											entry.path,
											entry.status,
										]),
									)}
								/>
								<Outline
									root={project.root}
									activePath={activePath}
									onNavigate={handleNavigate}
									cursor={cursor}
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
							<Breadcrumb
								root={root ?? ""}
								activePath={activePath}
								cursor={cursor}
								onNavigate={handleNavigate}
							/>
							<div className="editor-pane">
								<LazyEditor
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
									onCursor={setCursor}
									onApplyEdits={handleApplyEdits}
									blame={blameOn ? (blameByPath.get(active.path) ?? null) : null}
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
						<Suspense fallback={null}>
							<Terminal root={project.root} activePath={activePath} />
						</Suspense>
					) : project &&
						callsOpen &&
						root !== null &&
						activePath !== null &&
						callsCursor !== null ? (
						<CallsPanel
							root={root}
							path={activePath}
							cursor={callsCursor}
							onNavigate={handleNavigate}
							onClose={() => setCallsOpen(false)}
						/>
					) : project && callsOpen && root !== null ? (
						<section className="calls-panel" aria-label="Call hierarchy">
							<div className="calls-head">
								<span className="calls-title">Calls</span>
								<button
									type="button"
									className="calls-close"
									onClick={() => setCallsOpen(false)}
								>
									close
								</button>
							</div>
							<div className="calls-body">
								<p className="calls-empty">Place the caret on a symbol</p>
							</div>
						</section>
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
								root,
								buffers,
								setBuffers,
							}}
							tests={tests}
						/>
					) : null}
					{root !== null ? (
						<RunForm
							program={runProgramState}
							args={runArgsState}
							cwd={runCwdState}
							argv={[runProgramState, ...splitArgs(runArgsState)].join(" ")}
							cwdError={
								runCwdState !== "" && !runCwdState.startsWith("/")
									? "cwd must be absolute"
									: null
							}
							running={runId !== null}
							env={runEnvState}
							onArgsChange={setRunArgsState}
							onCwdChange={setRunCwdState}
							onEnvChange={setRunEnvState}
							onRun={() => void handleRun()}
							onStop={() => void handleStop()}
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
						<Suspense fallback={null}>
							<SearchPalette
								root={root}
								onOpen={handleOpenMatch}
								onClose={closeSearch}
							/>
						</Suspense>
					) : null}
					{quickOpenOpen && root !== null ? (
						<Suspense fallback={null}>
							<QuickOpen
								root={root}
								openPaths={new Set(buffers.map((buffer) => buffer.path))}
								onOpen={handleOpenQuick}
								onClose={() => setQuickOpenOpen(false)}
							/>
						</Suspense>
					) : null}
					{shortcutsOpen ? (
						<ShortcutSheet
							groups={SHORTCUT_GROUPS}
							onClose={() => setShortcutsOpen(false)}
						/>
					) : null}
					<Suspense fallback={null}>
						<CommandPalette
							open={commandPaletteOpen}
							commands={commands}
							recent={recentCommands}
							onRecent={setRecentCommands}
							onClose={() => setCommandPaletteOpen(false)}
						/>
					</Suspense>
				</main>

				{debugOpen && root !== null ? (
					<Suspense fallback={null}>
						<DebugPanel
							debug={debug}
							activePath={activePath}
							cursor={cursor}
							onNavigate={handleNavigate}
						/>
					</Suspense>
				) : null}
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
			) : gitCommitDiffHash !== null && root !== null ? (
				<DiffView
					root={root}
					commit={gitCommitDiffHash}
					onClose={() => setGitCommitDiffHash(null)}
				/>
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
