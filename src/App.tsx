import { open } from "@tauri-apps/plugin-dialog";
import {
	type CSSProperties,
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import TypeHierarchyPanel from "@/lsp/TypeHierarchyPanel";
import Outline from "@/outline/Outline";
import type { Command } from "@/palette/CommandPalette";

import { fileName, problemFiles } from "@/problems/model";
import {
	buildProject,
	type Diagnostic,
	defaultLaunchConfig,
	type FileEntry,
	type GitStatus,
	gitBlame,
	gitStatus,
	type Location,
	lspCodeActions,
	onRunExited,
	onRunOutput,
	openProject,
	type ProjectInfo,
	type RunConfiguration,
	readSettings,
	readProjectSettings,
	readTextFile,
	rememberRoot,
	runProgram,
	type Settings,
	settingsForWrite,
	stopProgram,
	type ToolchainReport,
	toolchains,
	writeProjectSettings,
	writeSettings,
} from "@/project/api";
import { type FileBuffer, isDirty } from "@/project/buffer";
import { describeError } from "@/project/errors";
import { type SaveOutcome, saveBuffer, saveErrorMessage, saveMessage } from "@/project/save";
import NewProject from "@/projects/NewProject";
import RecentProjects from "@/projects/RecentProjects";

import { applyFileEdits } from "@/refactor/apply";
import {
	applyConfiguration,
	configurationNameError,
	snapshotConfiguration,
} from "@/run/configurations";
import RunForm from "@/run/RunForm";
import RunLog from "@/run/RunLog";
import { splitArgs } from "@/run/splitArgs";

import Goto, { type GotoMode } from "@/goto/Goto";
import Generate from "@/generate/Generate";
import { generateItems, type GenerateItem } from "@/generate/model";
import ShortcutSheet from "@/shortcuts/ShortcutSheet";
import SettingsPage from "@/settings/SettingsPage";
import { DEFAULT_PANEL_SIZES, type PanelName, resizePanel } from "@/layout/model";
import Splitter from "@/layout/Splitter";
import {
	DEFAULT_PREFERENCES,
	DEFAULT_PROJECT_SETTINGS,
	effectivePreferences,
	normalizePreferences,
	normalizeProjectSettings,
	type Preferences,
	type ProjectSettings,
} from "@/settings/model";

import TestsDock, { type DockTab } from "@/tests/TestsDock";
import { useTests } from "@/tests/useTests";
import UpdateNotice from "@/updates/UpdateNotice";
import "./styles.css";

const DebugPanel = lazy(() => import("@/debug/DebugPanel"));
const CommandPalette = lazy(() => import("@/palette/CommandPalette"));
const QuickOpen = lazy(() => import("@/quickopen/QuickOpen"));
const SearchPalette = lazy(() => import("@/search/SearchPalette"));
const Terminal = lazy(() => import("@/terminal/Terminal"));

const NO_BREAKPOINTS: BreakpointRow[] = [];

/** The short language name the status bar shows for a path. */
function languageLabel(path: string | null): string | null {
	if (path === null) return null;
	const dot = path.lastIndexOf(".");
	if (dot === -1) return null;
	const extension = path.slice(dot + 1).toLowerCase();
	if (extension === "rs") return "rust";
	if (["c", "h", "cc", "cpp", "cxx", "hh", "hpp"].includes(extension)) return "c++";
	return extension;
}

const SHORTCUT_GROUPS = [
	{
		title: "Project",
		entries: [
			{ keys: ["Cmd", "K"], action: "Toggle shortcut sheet" },
			{ keys: ["Cmd", "Shift", "P"], action: "Open command palette" },
			{ keys: ["Cmd", ","], action: "Open settings" },
			{ keys: ["Cmd", ";"], action: "Open settings (same page)" },
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
			{ keys: ["Alt", "Enter"], action: "Code actions at the caret" },
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
		title: "Build and run",
		entries: [
			{ keys: ["Ctrl", "R"], action: "Run" },
			{ keys: ["Ctrl", "D"], action: "Debug" },
			{ keys: ["Cmd", "R"], action: "Rerun" },
		],
	},
	{
		title: "Debug",
		entries: [
			{ keys: ["Cmd", "F10"], action: "Run to cursor" },
			{ keys: ["Cmd", "F8"], action: "Toggle breakpoint on the caret line" },
			{ keys: ["F7"], action: "Step into" },
			{ keys: ["F8"], action: "Step over" },
			{ keys: ["Shift", "F8"], action: "Step out" },
			{ keys: ["F9"], action: "Resume" },
		],
	},
	{
		title: "Panels",
		entries: [
			{ keys: ["Esc"], action: "Close in-file search / sheet" },
			{ keys: ["Cmd", "1"], action: "Toggle project rail" },
			{ keys: ["Cmd", "5"], action: "Toggle debug panel" },
			{ keys: ["Alt", "F12"], action: "Toggle terminal" },
		],
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

/** What `buildProject` takes; the toolbar keeps the last pick for the session. */
type BuildProfile = "debug" | "release";

/** The profiles the Build split control offers, in menu order. */
const BUILD_PROFILES: { value: BuildProfile; label: string }[] = [
	{ value: "debug", label: "Debug" },
	{ value: "release", label: "Release" },
];

export default function App() {
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [gitStatusState, setGitStatusState] = useState<GitStatus | null>(null);
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const [buffers, setBuffers] = useState<FileBuffer[]>([]);
	const [activePath, setActivePath] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [serverDiagnostics, setServerDiagnostics] = useState<DiagnosticMap>(() => new Map());
	const [buildDiagnostics, setBuildDiagnostics] = useState<DiagnosticMap>(() => new Map());
	const [building, setBuilding] = useState(false);
	const [buildMenuOpen, setBuildMenuOpen] = useState(false);
	/** User-wide preferences, saved with the rest of the settings file. */
	const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
	/** This project's overrides; null when there is no project or the file does not exist. */
	const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	/** Which settings tab a shortcut asked for. */
	const [settingsTab, setSettingsTab] = useState<"user" | "project">("user");
	const [gotoMode, setGotoMode] = useState<GotoMode | null>(null);
	const [generateOpen, setGenerateOpen] = useState(false);
	const [recentFiles, setRecentFiles] = useState<string[]>([]);
	const [newProjectOpen, setNewProjectOpen] = useState(false);
	/** The run-configuration tool window; closed by default so it never sits on the editor. */
	const [runPanelOpen, setRunPanelOpen] = useState(false);
	const projectSettingsWrite = useRef<Promise<void>>(Promise.resolve());
	const buildSplitRef = useRef<HTMLDivElement | null>(null);
	const buildChevronRef = useRef<HTMLButtonElement | null>(null);
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
	/** Saved run panels the run form offers, in save order. */
	const [runConfigurations, setRunConfigurations] = useState<RunConfiguration[]>([]);
	/** Name the selector shows; `null` means the form's values are unsaved. */
	const [selectedRunConfiguration, setSelectedRunConfiguration] = useState<string | null>(null);
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
	const [typeHierarchyOpen, setTypeHierarchyOpen] = useState(false);
	const [typeHierarchyCursor, setTypeHierarchyCursor] = useState<{
		line: number;
		character: number;
	} | null>(null);
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
	/** The build-profile menu closes on a click outside it and on Escape, like the recents menu. */
	useEffect(() => {
		if (!buildMenuOpen) {
			return;
		}
		const handlePointer = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (buildSplitRef.current?.contains(target) === true) {
				return;
			}
			setBuildMenuOpen(false);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setBuildMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handlePointer);
		window.addEventListener("keydown", handleKey, true);
		return () => {
			document.removeEventListener("mousedown", handlePointer);
			window.removeEventListener("keydown", handleKey, true);
		};
	}, [buildMenuOpen]);
	const reading = useRef<Set<string>>(new Set());
	/** Mirrors of the live state so the global key handler and the save loop never read a stale run. */
	const buffersRef = useRef<FileBuffer[]>([]);
	const activePathRef = useRef<string | null>(null);
	const editorRef = useRef<EditorHandle | null>(null);
	const saveTimer = useRef<number | null>(null);
	const restoredRef = useRef(false);
	/** The settings object read from disk, so a save never drops a field this build does not know. */
	const preservedSettings = useRef<Record<string, unknown>>({});
	const snapshotRef = useRef<{
		project: ProjectInfo | null;
		buffers: FileBuffer[];
		activePath: string | null;
		railCollapsed: boolean;
		debugOpen: boolean;
		gitOpen: boolean;
		panelOpen: boolean | null;
		dockTab: DockTab;
		runConfigurations: RunConfiguration[];
		preferences: Preferences;
		recentFiles: string[];
	}>({
		project: null,
		buffers: [],
		activePath: null,
		railCollapsed: false,
		debugOpen: false,
		gitOpen: false,
		panelOpen: null,
		dockTab: "problems",
		runConfigurations: [],
		preferences: DEFAULT_PREFERENCES,
		recentFiles: [],
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
		runConfigurations,
		preferences,
		recentFiles,
	};

	useEffect(() => {
		toolchains().then(
			(next) => setReport(next),
			() => setReport(null),
		);
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await readSettings();
				if (cancelled) return;
				preservedSettings.current = settings;
				setPreferences(normalizePreferences(settings.preferences));
				setRailCollapsed(settings.railCollapsed ?? false);
				setDebugOpen(settings.debugOpen ?? false);
				setGitOpen(settings.gitOpen ?? false);
				setPanelOpen(settings.dockExpanded ?? null);
				setRecentRoots(settings.recentRoots ?? []);
				setRecentFiles(settings.recentFiles ?? []);
				setRunConfigurations(settings.runConfigurations ?? []);
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
							await writeSettings(
								settingsForWrite(preservedSettings.current, {
									lastRoot: null,
									openFiles: [],
									activeFile: null,
								}),
							);
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
				runConfigurations,
				preferences,
				recentFiles,
			};
			void writeSettings(settingsForWrite(preservedSettings.current, settings)).catch(
				(error) => setNotice(describeError(error)),
			);
		}, 400);
		return () => window.clearTimeout(timer);
	}, [
		project,
		buffers,
		activePath,
		railCollapsed,
		debugOpen,
		gitOpen,
		dockTab,
		panelOpen,
		runConfigurations,
		preferences,
		recentFiles,
	]);

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
				runConfigurations: snap.runConfigurations,
				preferences: snap.preferences,
				recentFiles: snap.recentFiles,
			};
			void writeSettings(settingsForWrite(preservedSettings.current, settings)).catch(
				(error) => setNotice(describeError(error)),
			);
		};
		const handleVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, []);

	const root = project?.root ?? null;

	/** What the editor, build and formatter actually use: this project's overrides, else the user's. */
	const effective = effectivePreferences(preferences, projectSettings);
	const buildProfile = effective.buildProfile;
	const panels = effective.panelSizes;

	useEffect(() => {
		if (root === null) {
			setProjectSettings(null);
			return;
		}
		let cancelled = false;
		void readProjectSettings(root).then(
			(next) => {
				if (!cancelled) setProjectSettings(normalizeProjectSettings(next));
			},
			() => {
				if (!cancelled) setProjectSettings(null);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [root]);

	/** Writes run one after another so a burst of clicks cannot land out of order. */
	const handleProjectSettingsChange = useCallback(
		(next: ProjectSettings | null) => {
			const currentRoot = project?.root ?? null;
			setProjectSettings(next);
			if (currentRoot === null) return;
			projectSettingsWrite.current = projectSettingsWrite.current
				.then(() => writeProjectSettings(currentRoot, next ?? DEFAULT_PROJECT_SETTINGS))
				.catch((error: unknown) => setNotice(describeError(error)));
		},
		[project],
	);

	/** A profile picked in the toolbar lands in the project's overrides when one is open. */
	const applyBuildProfile = useCallback(
		(profile: BuildProfile) => {
			if (project === null) {
				setPreferences((current) => ({ ...current, buildProfile: profile }));
				return;
			}
			handleProjectSettingsChange({
				...(projectSettings ?? DEFAULT_PROJECT_SETTINGS),
				buildProfile: profile,
			});
		},
		[handleProjectSettingsChange, project, projectSettings],
	);

	const handlePanelResize = useCallback((name: PanelName, px: number) => {
		setPreferences((current) => ({
			...current,
			panelSizes: resizePanel(current.panelSizes, name, px),
		}));
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			if (event.key !== ",") return;
			event.preventDefault();
			setSettingsOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

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
				const found = buffersRef.current.find((entry) => entry.path === path);
				if (!found) {
					continue;
				}
				let buffer = found;
				// Format-on-save rewrites the text before the write, so the file on disk is the
				// formatted one and a second save is never needed to land the formatter's edits.
				if (formatOnSaveRef.current && path === activePathRef.current) {
					const formatted = await editorRef.current?.formatText();
					if (
						formatted !== null &&
						formatted !== undefined &&
						formatted !== buffer.text
					) {
						buffer = { ...buffer, text: formatted };
						const next: FileBuffer = buffer;
						setBuffers((current) =>
							current.map((entry) => (entry.path === path ? next : entry)),
						);
					}
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
	// The hook owns the server lifecycle and reports its own failures; the bar no longer shows it.
	useLspServer(root, reportNotice);
	const debug = useDebugSession(root, buildProfile);

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
	const missingTools =
		report === null ? 0 : report.tools.filter((tool) => tool.source === "missing").length;
	/** Only a failed save earns a slot in the bar; a successful one is not news. */
	const saveError = saveStatus?.failed === true ? saveStatus.text : null;

	/** Read inside save callbacks, so a settings change never rebuilds the save path. */
	const formatOnSaveRef = useRef(effective.formatOnSave);
	formatOnSaveRef.current = effective.formatOnSave;

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

	/** Shift+Alt+T opens the type hierarchy panel. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.shiftKey || !event.altKey || event.metaKey || event.ctrlKey) return;
			if (event.key.toLowerCase() !== "t") return;
			event.preventDefault();
			setTypeHierarchyCursor(cursor);
			setTypeHierarchyOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [cursor]);

	const openPath = useCallback(
		async (path: string, name: string) => {
			setRecentFiles((current) =>
				[path, ...current.filter((entry) => entry !== path)].slice(0, 20),
			);
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

	/** The form as one value, so a snapshot and a save share the same fields. */
	const runFormSnapshot = useCallback(
		() => ({
			program: runProgramState,
			args: runArgsState,
			cwd: runCwdState,
			env: runEnvState,
		}),
		[runProgramState, runArgsState, runCwdState, runEnvState],
	);

	/** Fills the form from a saved configuration; `""` is the selector's unsaved entry. */
	const handleSelectRunConfiguration = useCallback(
		(name: string) => {
			setSelectedRunConfiguration(name === "" ? null : name);
			const config = runConfigurations.find((item) => item.name === name);
			if (config === undefined) {
				return;
			}
			const form = applyConfiguration(config);
			setRunProgramState(form.program);
			setRunArgsState(form.args);
			setRunCwdState(form.cwd);
			setRunEnvState(form.env);
		},
		[runConfigurations],
	);

	const handleSaveRunConfiguration = useCallback(
		(name: string) => {
			const error = configurationNameError(name, runConfigurations);
			if (error !== null) {
				return error;
			}
			const config = snapshotConfiguration(name, runFormSnapshot());
			setRunConfigurations((current) => [...current, config]);
			setSelectedRunConfiguration(config.name);
			return null;
		},
		[runConfigurations, runFormSnapshot],
	);

	const handleUpdateRunConfiguration = useCallback(() => {
		if (selectedRunConfiguration === null) {
			return "select a configuration first";
		}
		const config = snapshotConfiguration(selectedRunConfiguration, runFormSnapshot());
		setRunConfigurations((current) =>
			current.map((item) => (item.name === selectedRunConfiguration ? config : item)),
		);
		return null;
	}, [selectedRunConfiguration, runFormSnapshot]);

	const handleDeleteRunConfiguration = useCallback(() => {
		if (selectedRunConfiguration === null) {
			return "select a configuration first";
		}
		setRunConfigurations((current) =>
			current.filter((item) => item.name !== selectedRunConfiguration),
		);
		setSelectedRunConfiguration(null);
		return null;
	}, [selectedRunConfiguration]);

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
		setBuildMenuOpen(false);
		setBuilding(true);
		try {
			const result = await buildProject(root, buildProfile);
			setBuildDiagnostics(groupDiagnostics(result.diagnostics));
			if (result.diagnostics.length === 0) setNotice(result.summary);
		} catch (error) {
			setNotice(`Build failed: ${describeError(error)}`);
		} finally {
			setBuilding(false);
		}
	}, [root, building, buildProfile]);

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

	/**
	 * CLion's macOS map, for the actions quarry already has.
	 *
	 * IntelliJ keeps Cmd for navigation and hands the run actions to Control (⌃R run, ⌃D debug),
	 * so that is what these are. Step keys only act while a session is live, which keeps F7/F8 free
	 * for anything else when nothing is being debugged.
	 */
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.metaKey || event.ctrlKey;
			const ctrlOnly = event.ctrlKey && !event.metaKey && !event.altKey;
			const key = event.key.toLowerCase();
			const live = debug.status === "running" || debug.status === "stopped";

			if (ctrlOnly && key === "r") {
				event.preventDefault();
				void handleRun();
				return;
			}
			if (ctrlOnly && key === "d") {
				event.preventDefault();
				setDebugOpen(true);
				debug.launch();
				return;
			}
			if (mod && !event.altKey && key === "r") {
				event.preventDefault();
				void (async () => {
					if (runId !== null) await handleStop();
					await handleRun();
				})();
				return;
			}
			if (live && event.key === "F7") {
				event.preventDefault();
				debug.step("stepIn");
				return;
			}
			if (live && event.key === "F8") {
				event.preventDefault();
				debug.step(event.shiftKey ? "stepOut" : "next");
				return;
			}
			if (live && event.key === "F9") {
				event.preventDefault();
				debug.continueRun();
				return;
			}
			if (mod && !event.altKey && key === "f8" && activePath !== null && cursor !== null) {
				event.preventDefault();
				toggleBreakpoint(activePath, cursor.line + 1);
				return;
			}
			if (mod && !event.shiftKey && !event.altKey && key === "o") {
				event.preventDefault();
				if (root !== null) setGotoMode("class");
				return;
			}
			if (mod && event.shiftKey && !event.altKey && key === "o") {
				event.preventDefault();
				if (root !== null) setQuickOpenOpen(true);
				return;
			}
			if (mod && event.altKey && key === "o") {
				event.preventDefault();
				if (activePath !== null) setGotoMode("symbol");
				return;
			}
			if (ctrlOnly && key === "e") {
				event.preventDefault();
				setGotoMode("recent");
				return;
			}
			if (mod && !event.shiftKey && !event.altKey && key === "n") {
				event.preventDefault();
				if (activePath !== null) setGenerateOpen(true);
				return;
			}
			if (event.ctrlKey && event.altKey && !event.metaKey && key === "o") {
				event.preventDefault();
				organizeRef.current();
				return;
			}
			if (event.ctrlKey && event.altKey && !event.metaKey && (key === "r" || key === "d")) {
				event.preventDefault();
				setRunPanelOpen(true);
				return;
			}
			if (mod && !event.altKey && key === "1") {
				event.preventDefault();
				setRailCollapsed((current) => !current);
				return;
			}
			if (mod && !event.altKey && key === "5") {
				event.preventDefault();
				if (root !== null) setDebugOpen((current) => !current);
				return;
			}
			if (event.altKey && event.key === "F12") {
				event.preventDefault();
				setTerminalOpen((current) => !current);
				return;
			}
			if (mod && !event.altKey && event.key === ";") {
				event.preventDefault();
				setSettingsTab(root === null ? "user" : "project");
				setSettingsOpen(true);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activePath, cursor, debug, handleRun, handleStop, root, runId, toggleBreakpoint]);

	/** The key handler runs before the callback exists, so it reaches it through a ref. */
	const organizeRef = useRef<() => void>(() => {});

	/** Applies one Generate item to the active buffer; the editor syncs from its value prop. */
	const applyGenerate = useCallback(
		(item: GenerateItem) => {
			const target = activePath;
			if (target === null) return;
			setBuffers((current) =>
				current.map((buffer) => {
					if (buffer.path !== target) return buffer;
					if (item.insert === "end") {
						const base = buffer.text.endsWith("\n") ? buffer.text : `${buffer.text}\n`;
						return { ...buffer, text: `${base}${item.text.replace(/^\n/, "")}` };
					}
					const lines = buffer.text.split("\n");
					const line = Math.min(Math.max(cursor?.line ?? 0, 0), lines.length - 1);
					lines[line] = `${lines[line]}${item.text}`;
					return { ...buffer, text: lines.join("\n") };
				}),
			);
		},
		[activePath, cursor],
	);

	/**
	 * Organise imports, the way CLion's Ctrl Opt O does it: ask the server for code actions at the
	 * top of the file and apply the first one the server marks as an import organiser. Servers that
	 * do not implement it answer with nothing, which is reported rather than silently ignored.
	 */
	const organizeImports = useCallback(async () => {
		const currentRoot = project?.root ?? null;
		const path = activePath;
		if (currentRoot === null || path === null) return;
		setFormatting(true);
		try {
			const actions = await lspCodeActions(currentRoot, path, 0, 0);
			const organize = actions.find((action) =>
				(action.kind ?? "").startsWith("source.organizeImports"),
			);
			if (organize === undefined) {
				setNotice("This language server has no organise-imports action");
				return;
			}
			handleApplyEdits(organize.edits);
			setNotice(organize.title);
		} catch (error) {
			setNotice(describeError(error));
		} finally {
			setFormatting(false);
		}
	}, [activePath, handleApplyEdits, project]);

	organizeRef.current = () => void organizeImports();

	return (
		<div className="shell">
			<UpdateNotice />
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
				<div className="build-split" ref={buildSplitRef}>
					<button
						type="button"
						className="button build-main"
						disabled={root === null || building}
						title={`Build (${buildProfile})`}
						onClick={() => void handleBuild()}
					>
						{building
							? buildProfile === "release"
								? "Building release…"
								: "Building…"
							: "Build"}
					</button>
					<button
						ref={buildChevronRef}
						type="button"
						className="button build-chevron"
						disabled={root === null || building}
						aria-haspopup="menu"
						aria-expanded={buildMenuOpen}
						aria-label={`Build profile: ${buildProfile}`}
						title={`Build profile: ${buildProfile}`}
						onClick={() => setBuildMenuOpen((current) => !current)}
						onKeyDown={(event) => {
							if (
								event.key === "ArrowDown" ||
								event.key === "Enter" ||
								event.key === " "
							) {
								event.preventDefault();
								setBuildMenuOpen(true);
							}
						}}
					>
						▾
					</button>
					{buildMenuOpen ? (
						<div className="build-menu" role="menu" aria-label="Build profile">
							{BUILD_PROFILES.map((profile) => (
								<button
									key={profile.value}
									type="button"
									role="menuitemradio"
									aria-checked={buildProfile === profile.value}
									className={
										buildProfile === profile.value
											? "build-menu-item active"
											: "build-menu-item"
									}
									onClick={() => {
										applyBuildProfile(profile.value);
										setBuildMenuOpen(false);
										buildChevronRef.current?.focus();
									}}
								>
									{profile.label}
								</button>
							))}
						</div>
					) : null}
				</div>
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
				<button
					type="button"
					className="button"
					disabled={opening}
					onClick={() => setNewProjectOpen(true)}
				>
					New project
				</button>
				<button
					type="button"
					className="button button-icon"
					aria-label="Settings"
					title="Settings (⌘,)"
					onClick={() => setSettingsOpen(true)}
				>
					⚙
				</button>
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
				style={
					{
						"--rail-width": `${panels.railWidth}px`,
						"--debug-width": `${panels.debugWidth}px`,
						"--terminal-width": `${panels.terminalWidth}px`,
					} as CSSProperties
				}
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
									onFileRenamed={(oldPath, newPath) => {
										setBuffers((current) =>
											current.map((buffer) =>
												buffer.path === oldPath
													? {
															...buffer,
															path: newPath,
															name: fileName(newPath),
														}
													: buffer,
											),
										);
										if (activePath === oldPath) setActivePath(newPath);
									}}
									onFileDeleted={(path) => {
										const buffer = buffers.find((b) => b.path === path);
										if (buffer && isDirty(buffer)) {
											setNotice(
												`Deleted ${fileName(path)} (unsaved changes lost)`,
											);
										}
										setBuffers((current) =>
											current.filter((b) => b.path !== path),
										);
										if (activePath === path) {
											setActivePath(null);
										}
									}}
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

				{railCollapsed ? null : (
					<Splitter
						axis="x"
						value={panels.railWidth}
						min={160}
						max={560}
						label="Resize explorer"
						onChange={(next) => handlePanelResize("railWidth", next)}
					/>
				)}

				<main
					className="canvas"
					style={
						{
							"--dock-height": `${panels.dockHeight}px`,
							"--terminal-height": `${panels.terminalHeight}px`,
						} as CSSProperties
					}
				>
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
									tabSize={effective.editorTabSize}
									fontSize={effective.editorFontSize}
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
					{project && terminalOpen && effective.terminalPlacement === "bottom" ? (
						<>
							<Splitter
								axis="y"
								value={panels.terminalHeight}
								min={100}
								max={900}
								invert
								label="Resize terminal"
								onChange={(next) => handlePanelResize("terminalHeight", next)}
							/>
							<Suspense fallback={null}>
								<Terminal
									root={project.root}
									activePath={activePath}
									defaultFontSize={effective.terminalFontSize}
								/>
							</Suspense>
						</>
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
					) : project &&
					  typeHierarchyOpen &&
					  root !== null &&
					  activePath !== null &&
					  typeHierarchyCursor !== null ? (
						<TypeHierarchyPanel
							root={root}
							path={activePath}
							cursor={typeHierarchyCursor}
							onNavigate={handleNavigate}
							onClose={() => setTypeHierarchyOpen(false)}
						/>
					) : project ? (
						<>
							{panelExpanded ? (
								<Splitter
									axis="y"
									value={panels.dockHeight}
									min={120}
									max={900}
									invert
									label="Resize bottom dock"
									onChange={(next) => handlePanelResize("dockHeight", next)}
								/>
							) : null}
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
						</>
					) : null}
					{root !== null && runPanelOpen ? (
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
							configurations={runConfigurations}
							selectedConfiguration={selectedRunConfiguration}
							onProgramChange={setRunProgramState}
							onArgsChange={setRunArgsState}
							onCwdChange={setRunCwdState}
							onEnvChange={setRunEnvState}
							onSelectConfiguration={handleSelectRunConfiguration}
							onSaveConfiguration={handleSaveRunConfiguration}
							onUpdateConfiguration={handleUpdateRunConfiguration}
							onDeleteConfiguration={handleDeleteRunConfiguration}
							onRun={() => void handleRun()}
							onStop={() => void handleStop()}
							onClose={() => setRunPanelOpen(false)}
						/>
					) : null}
					{runId !== null || runLines.length > 0 || runExited !== null ? (
						<RunLog
							lines={runLines}
							exited={runExited}
							argv={[runProgramState, ...splitArgs(runArgsState)].join(" ")}
							running={runId !== null}
							onRerun={() => void handleRun()}
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

				{project && terminalOpen && effective.terminalPlacement === "right" ? (
					<>
						<Splitter
							axis="x"
							value={panels.terminalWidth}
							min={240}
							max={900}
							invert
							label="Resize terminal"
							onChange={(next) => handlePanelResize("terminalWidth", next)}
						/>
						<Suspense fallback={null}>
							<Terminal
								root={project.root}
								activePath={activePath}
								defaultFontSize={effective.terminalFontSize}
								placement="right"
							/>
						</Suspense>
					</>
				) : null}

				{debugOpen && root !== null ? (
					<>
						<Splitter
							axis="x"
							value={panels.debugWidth}
							min={200}
							max={640}
							invert
							label="Resize debug panel"
							onChange={(next) => handlePanelResize("debugWidth", next)}
						/>
						<Suspense fallback={null}>
							<DebugPanel
								debug={debug}
								activePath={activePath}
								cursor={cursor}
								onNavigate={handleNavigate}
							/>
						</Suspense>
					</>
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
				project={project}
				git={gitStatusState}
				errors={counts.errors}
				warnings={counts.warnings}
				missingTools={missingTools}
				saveError={saveError}
				caret={
					cursor === null ? null : { line: cursor.line + 1, column: cursor.character + 1 }
				}
				language={languageLabel(activePath)}
				tabSize={effective.editorTabSize}
				onOpenSettings={() => setSettingsOpen(true)}
			/>
			{settingsOpen ? (
				<SettingsPage
					open
					user={preferences}
					project={projectSettings}
					projectRoot={root}
					onClose={() => setSettingsOpen(false)}
					onUserChange={setPreferences}
					onProjectChange={handleProjectSettingsChange}
					onResetPanels={() =>
						setPreferences((current) => ({
							...current,
							panelSizes: DEFAULT_PANEL_SIZES,
						}))
					}
					initialTab={settingsTab}
				/>
			) : null}
			{gotoMode !== null && root !== null ? (
				<Goto
					mode={gotoMode}
					root={root}
					path={activePath}
					recent={recentFiles}
					onOpen={(target, line, character) => handleNavigate(target, line, character)}
					onClose={() => setGotoMode(null)}
				/>
			) : null}
			{generateOpen && active !== null ? (
				<Generate
					items={generateItems(active.path, active.text, cursor?.line ?? 0)}
					onPick={applyGenerate}
					onClose={() => setGenerateOpen(false)}
				/>
			) : null}
			<NewProject
				open={newProjectOpen}
				onClose={() => setNewProjectOpen(false)}
				onCreated={(nextRoot) => {
					setNewProjectOpen(false);
					void openRoot(nextRoot);
				}}
			/>
		</div>
	);
}
