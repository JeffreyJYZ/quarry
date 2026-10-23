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
import CallsPanel from "@/ui/calls/CallsPanel";
import { type BreakpointRow, useDebugSession } from "@/lib/debug/session";
import type { EditorHandle } from "@/ui/editor/Editor";
import { useDocumentSync, useLspServer } from "@/lib/lsp/session";
import TypeHierarchyPanel from "@/ui/lsp/TypeHierarchyPanel";
import type { Command } from "@/ui/palette/CommandPalette";

import { fileName } from "@/lib/problems/model";
import { isDirty } from "@/lib/project/buffer";
import {
	buildProject,
	type Location,
	lspCodeActions,
	type RunConfiguration,
	readProjectSettings,
	type ToolchainReport,
	toolchains,
	writeProjectSettings,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

import { splitArgs } from "@/lib/run/splitArgs";

import { generateItems, type GenerateItem } from "@/lib/generate/model";
import type { GotoMode } from "@/ui/goto/gotoModel";
import AppOverlays from "@/ui/app/AppOverlays";
import TopBar from "@/ui/app/TopBar";
import EditorStage from "@/ui/app/EditorStage";
import RunSection from "@/ui/app/RunSection";
import SideRail from "@/ui/app/SideRail";
import { useRunControls } from "@/ui/app/useRunControls";
import { useSaveBuffers } from "@/ui/app/useSaveBuffers";
import { useWorkspace } from "@/ui/app/useWorkspace";
import { useGitState } from "@/ui/app/useGitState";
import { useDiagnosticsState } from "@/ui/app/useDiagnosticsState";
import { buildCommands } from "@/ui/app/commands";
import { useKeybindings } from "@/ui/app/useKeybindings";
import { useSelectionKeybindings } from "@/ui/app/useSelectionKeybindings";
import { useClionKeymap } from "@/ui/app/useClionKeymap";
import { useSessionPersistence } from "@/ui/app/useSessionPersistence";
import type { SessionSnapshot } from "@/ui/app/useSessionPersistence";
import BottomDock, { Palettes } from "@/ui/app/BottomDock";
import type { DockTab } from "@/ui/tests/TestsDock";
import { DEFAULT_PANEL_SIZES, type PanelName, resizePanel } from "@/lib/layout/model";
import Splitter from "@/ui/layout/Splitter";
import {
	DEFAULT_PREFERENCES,
	DEFAULT_PROJECT_SETTINGS,
	effectivePreferences,
	normalizePreferences,
	normalizeProjectSettings,
	type Preferences,
	type ProjectSettings,
} from "@/lib/settings/model";

import { useTests } from "@/lib/tests/useTests";
import UpdateNotice from "@/ui/updates/UpdateNotice";
import "@/ui/styles.css";

const DebugPanel = lazy(() => import("@/ui/debug/DebugPanel"));
const Terminal = lazy(() => import("@/ui/terminal/Terminal"));

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

import type { StatusText as SaveStatus } from "@/ui/app/status";

/** What `buildProject` takes; the toolbar keeps the last pick for the session. */
type BuildProfile = "debug" | "release";

/** The profiles the Build split control offers, in menu order. */

export default function App() {
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const savePathsRef = useRef<(paths: string[]) => Promise<boolean>>(async () => false);
	const workspace = useWorkspace({
		onNotice: setNotice,
		onProjectOpened: () => {
			git.setRefreshToken((current) => current + 1);
			setGitDiffPath(null);
			setGitCommitDiffHash(null);
			setSaveStatus(null);
			setPanelOpen(null);
			setSearchOpen(false);
			setShortcutsOpen(false);
			setDebugOpen(false);
		},
		savePaths: (paths) => savePathsRef.current(paths),
		setRevealTarget: (target) => setRevealTarget(target),
		setRevealToken: (updater) => setRevealToken(updater),
		setReferences: (paths) => setReferences(paths),
		setRefsOpen: (open) => setRefsOpen(open),
		setSearchOpen: (open) => setSearchOpen(open),
		setQuickOpenOpen: (open) => setQuickOpenOpen(open),
	});
	const {
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
		openRoot,
		handleOpenProject,
		openPath,
		handleOpenFile,
		handleSelectProblem,
		handleOpenMatch,
		handleOpenQuick,
		handleNavigate,
		handleChange,
		handleApplyEdits,
		handleClose,
		handleSaveClose,
		handleDiscardClose,
		handleCancelClose,
		handleActivate,
	} = workspace;

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
	const [newProjectOpen, setNewProjectOpen] = useState(false);
	/** Directory the New project dialog starts in; remembered in settings. */
	const [newProjectParent, setNewProjectParent] = useState("");
	/** The run-configuration tool window; closed by default so it never sits on the editor. */
	const projectSettingsWrite = useRef<Promise<void>>(Promise.resolve());
	const buildSplitRef = useRef<HTMLDivElement | null>(null);
	const buildChevronRef = useRef<HTMLButtonElement | null>(null);
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
	const [gitDiffPath, setGitDiffPath] = useState<string | null>(null);
	const [gitCommitDiffHash, setGitCommitDiffHash] = useState<string | null>(null);
	const [terminalOpen, setTerminalOpen] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);

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
	/** Mirrors of the live state so the global key handler and the save loop never read a stale run. */
	const editorRef = useRef<EditorHandle | null>(null);

	const runConfigurationsRef = useRef<RunConfiguration[]>([]);

	const snapshotRef = useRef<SessionSnapshot>({
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
		newProjectParent: "",
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
		runConfigurations: runConfigurationsRef.current,
		preferences,
		recentFiles,
		newProjectParent,
	};

	useSessionPersistence({
		snapshotRef,
		setters: {
			onPreferences: (next) => setPreferences(normalizePreferences(next)),
			onRailCollapsed: setRailCollapsed,
			onDebugOpen: setDebugOpen,
			onGitOpen: setGitOpen,
			onPanelOpen: setPanelOpen,
			onRecentRoots: setRecentRoots,
			onRecentFiles: setRecentFiles,
			onNewProjectParent: setNewProjectParent,
			onDockTab: setDockTab,
			onRunConfigurations: (next) => runs.replaceConfigurations(next),
			onProject: setProject,
			onBuffers: setBuffers,
			onActivePath: setActivePath,
			onNotice: setNotice,
		},
	});

	useEffect(() => {
		toolchains().then(
			(next) => setReport(next),
			() => setReport(null),
		);
	}, []);

	const root = project?.root ?? null;

	const runs = useRunControls({
		root,
		initialConfigurations: runConfigurationsRef.current,
		onConfigurationsChange: (next) => {
			runConfigurationsRef.current = next;
		},
		onNotice: (message) => setNotice(message),
	});
	const runId = runs.running;
	const runLines = runs.lines;
	const runExited = runs.exited;
	const runProgramState = runs.program;
	const setRunProgramState = runs.setProgram;
	const runArgsState = runs.args;
	const setRunArgsState = runs.setArgs;
	const runCwdState = runs.cwd;
	const setRunCwdState = runs.setCwd;
	const runEnvState = runs.env;
	const setRunEnvState = runs.setEnv;
	const runConfigurations = runs.configurations;
	const selectedRunConfiguration = runs.selected;
	const handleSelectRunConfiguration = runs.select;
	const handleSaveRunConfiguration = runs.save;
	const handleUpdateRunConfiguration = runs.update;
	const handleDeleteRunConfiguration = runs.remove;
	const handleRun = runs.run;
	const handleStop = runs.stop;

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

	const git = useGitState({ root, activePath });
	const {
		status: gitStatusState,
		refresh: refreshGit,
		refreshToken: gitRefresh,
		setRefreshToken: setGitRefresh,
		blameOn,
		setBlameOn,
		blameByPath,
		blameSaveToken,
	} = git;

	const tests = useTests(root);

	const active = buffers.find((buffer) => buffer.path === activePath) ?? null;

	const formatOnSaveRef = useRef(effective.formatOnSave);
	formatOnSaveRef.current = effective.formatOnSave;
	const {
		savePaths: savePathsForClose,
		saveActive,
		saveAll,
		formatActive,
	} = useSaveBuffers({
		root,
		activePath,
		formatting,
		buffersRef,
		activePathRef,
		editorRef,
		formatOnSaveRef,
		setBuffers,
		setSaving,
		setSaveStatus,
		setFormatting,
		onSaved: (path) => git.forgetBlame(path),
		onBatchSaved: () => git.markSaved(),
	});

	const reportNotice = useCallback((message: string) => setNotice(message), []);
	// The hook owns the server lifecycle and reports its own failures; the bar no longer shows it.
	const lspOverrides =
		project?.kind === "cargo"
			? { path: effective.rustAnalyzerPath, args: splitArgs(effective.rustAnalyzerArgs) }
			: { path: effective.clangdPath, args: splitArgs(effective.clangdArgs) };
	const lspStatus = useLspServer(root, reportNotice, lspOverrides);
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

	const diagnosticsState = useDiagnosticsState({ root, onError: reportNotice });
	useDocumentSync({
		root,
		path: active?.path ?? null,
		text: active?.text ?? "",
		report: reportNotice,
		ready: lspStatus !== null,
	});

	const { diagnostics, counts, files } = diagnosticsState;

	const panelExpanded = panelOpen ?? counts.errors > 0;
	const missingTools =
		report === null ? 0 : report.tools.filter((tool) => tool.source === "missing").length;
	/** Only a failed save earns a slot in the bar; a successful one is not news. */
	const saveError = saveStatus?.failed === true ? saveStatus.text : null;

	/** Read inside save callbacks, so a settings change never rebuilds the save path. */

	const previousErrors = useRef(counts.errors);
	useEffect(() => {
		if (counts.errors > 0 && previousErrors.current === 0) {
			setPanelOpen(null);
		}
		previousErrors.current = counts.errors;
	}, [counts.errors]);

	useKeybindings({
		root,
		activePath,
		cursor,
		panelExpanded,
		activePathRef,
		runToCursor: debug.runToCursor,
		saveActive,
		saveAll,
		formatActive,
		setShortcutsOpen,
		setRailCollapsed,
		setPanelOpen,
		setDebugOpen,
		setGitOpen,
		setCommandPaletteOpen,
		setFileRevealToken,
		setQuickOpenOpen,
		setSearchOpen,
		setCallsCursor,
		setCallsOpen,
		setTypeHierarchyCursor,
		setTypeHierarchyOpen,
	});
	useSelectionKeybindings({
		root,
		activePath,
		cursor,
		activePathRef,
		runToCursor: debug.runToCursor,
		setFileRevealToken,
		setQuickOpenOpen,
		setCallsCursor,
		setCallsOpen,
		setTypeHierarchyCursor,
		setTypeHierarchyOpen,
	});

	const handleReferences = useCallback((locations: Location[]) => {
		setReferences(locations);
		setRefsOpen(true);
	}, []);

	const closeSearch = useCallback(() => setSearchOpen(false), []);

	savePathsRef.current = savePathsForClose;

	const handleBuild = useCallback(async () => {
		if (root === null || building) {
			return;
		}
		setBuildMenuOpen(false);
		setBuilding(true);
		try {
			const result = await buildProject(root, buildProfile);
			diagnosticsState.setBuildReport(result.diagnostics);
			if (result.diagnostics.length === 0) setNotice(result.summary);
		} catch (error) {
			setNotice(`Build failed: ${describeError(error)}`);
		} finally {
			setBuilding(false);
		}
	}, [root, building, buildProfile, diagnosticsState]);

	const commands: Command[] = buildCommands({
		root,
		activePath,
		cursor,
		building,
		formatting,
		running: runId,
		panelExpanded,
		openProject: () => void handleOpenProject(),
		build: () => void handleBuild(),
		run: () => void handleRun(),
		stop: () => void handleStop(),
		save: () => void saveActive(),
		saveAll: () => void saveAll(),
		format: () => void formatActive(),
		runToCursor: (path, line) => debug.runToCursor(path, line),
		toggleDebug: () => setDebugOpen((current) => !current),
		toggleGit: () => setGitOpen((current) => !current),
		openSearch: () => setSearchOpen(true),
		toggleRail: () => setRailCollapsed((current) => !current),
		toggleDock: () => setPanelOpen(!panelExpanded),
		toggleTerminal: () =>
			setTerminalOpen((current) => {
				if (!current) setPanelOpen(true);
				return !current;
			}),
		revealFile: () => setFileRevealToken((current) => current + 1),
		openQuick: () => setQuickOpenOpen(true),
		openShortcuts: () => setShortcutsOpen(true),
		refreshGit: () => setGitRefresh((current) => current + 1),
		toggleBlame: () => setBlameOn((current) => !current),
	});

	useClionKeymap({
		root,
		activePath,
		cursor,
		running: runId,
		debug,
		run: () => void handleRun(),
		stop: () => void handleStop(),
		toggleBreakpoint,
		organizeImports: () => organizeRef.current(),
		openRunPanel: runs.openPanel,
		setDebugOpen,
		setGotoMode,
		setGenerateOpen,
		setQuickOpenOpen,
		setRailCollapsed,
		setTerminalOpen,
		setSettingsOpen,
		setSettingsTab,
	});

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
		[activePath, cursor, setBuffers],
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
			<TopBar
				root={root}
				project={project}
				opening={opening}
				onOpenProject={() => void handleOpenProject()}
				recentRoots={recentRoots}
				onOpenRoot={(nextRoot) => void openRoot(nextRoot)}
				buildSplitRef={buildSplitRef}
				buildChevronRef={buildChevronRef}
				building={building}
				buildProfile={buildProfile}
				buildMenuOpen={buildMenuOpen}
				onToggleBuildMenu={() => setBuildMenuOpen((current) => !current)}
				onOpenBuildMenu={() => setBuildMenuOpen(true)}
				onPickBuildProfile={(profile) => {
					applyBuildProfile(profile);
					setBuildMenuOpen(false);
					buildChevronRef.current?.focus();
				}}
				onBuild={() => void handleBuild()}
				runId={runId}
				onRun={() => void handleRun()}
				onStop={() => void handleStop()}
				formatting={formatting}
				activePath={activePath}
				onFormat={() => void formatActive()}
				gitOpen={gitOpen}
				onToggleGit={() => setGitOpen((current) => !current)}
				debugOpen={debugOpen}
				onToggleDebug={() => setDebugOpen((current) => !current)}
				panelExpanded={panelExpanded}
				dockTab={dockTab}
				onShowTests={() => {
					setDockTab("tests");
					setPanelOpen(true);
				}}
				blameOn={blameOn}
				onToggleBlame={() => setBlameOn((current) => !current)}
				terminalOpen={terminalOpen}
				onToggleTerminal={() => {
					setTerminalOpen((current) => !current);
					if (!terminalOpen) setPanelOpen(true);
				}}
				onNewProject={() => setNewProjectOpen(true)}
			/>

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
				<SideRail
					gitOpen={gitOpen}
					project={project}
					root={root}
					activePath={activePath}
					cursor={cursor}
					gitStatus={gitStatusState}
					gitRefresh={gitRefresh}
					blameSaveToken={blameSaveToken}
					revealToken={fileRevealToken}
					changes={Object.fromEntries(
						(gitStatusState?.entries ?? []).map((entry) => [entry.path, entry.status]),
					)}
					diffPath={gitDiffPath}
					onOpenFile={handleOpenFile}
					onOpenGitFile={(path) => void openPath(path, fileName(path))}
					onFileRenamed={(oldPath, newPath) => {
						setBuffers((current) =>
							current.map((buffer) =>
								buffer.path === oldPath
									? { ...buffer, path: newPath, name: fileName(newPath) }
									: buffer,
							),
						);
						if (activePath === oldPath) setActivePath(newPath);
					}}
					onFileDeleted={(path) => {
						const buffer = buffers.find((b) => b.path === path);
						if (buffer && isDirty(buffer)) {
							setNotice(`Deleted ${fileName(path)} (unsaved changes lost)`);
						}
						setBuffers((current) => current.filter((b) => b.path !== path));
						if (activePath === path) setActivePath(null);
					}}
					onReveal={() => setFileRevealToken((current) => current + 1)}
					onRefresh={refreshGit}
					onDiff={setGitDiffPath}
					onCommitDiff={setGitCommitDiffHash}
					onNavigate={handleNavigate}
				/>

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
					<EditorStage
						project={project}
						root={root}
						active={active}
						activePath={activePath}
						buffers={buffers}
						saving={saving}
						confirmClose={confirmClose}
						cursor={cursor}
						effective={effective}
						editorRef={editorRef}
						diagnostics={diagnostics}
						breakpointLines={breakpointLines}
						unverifiedLines={unverifiedLines}
						blameOn={blameOn}
						blameByPath={blameByPath}
						revealTarget={revealTarget}
						revealToken={revealToken}
						onActivate={handleActivate}
						onClose={handleClose}
						onSaveClose={handleSaveClose}
						onDiscardClose={handleDiscardClose}
						onCancelClose={handleCancelClose}
						onChange={handleChange}
						onNavigate={handleNavigate}
						onReferences={handleReferences}
						onCursor={setCursor}
						onApplyEdits={handleApplyEdits}
						onToggleBreakpoint={handleToggleBreakpoint}
						onNotice={setNotice}
					/>
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
									fontFamily={effective.terminalFontFamily}
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
						<BottomDock
							open
							expanded={panelExpanded}
							tab={dockTab}
							dockHeight={panels.dockHeight}
							problemFiles={files}
							counts={counts}
							root={root}
							activePath={activePath}
							buffers={buffers}
							onResize={(next) => handlePanelResize("dockHeight", next)}
							onToggleExpanded={() => setPanelOpen(!panelExpanded)}
							onSelectTab={setDockTab}
							onSelectProblem={handleSelectProblem}
							onBuffersChange={setBuffers}
							tests={tests}
						/>
					) : null}
					<RunSection
						root={root}
						open={runs.panelOpen}
						program={runProgramState}
						args={runArgsState}
						cwd={runCwdState}
						env={runEnvState}
						configurations={runConfigurations}
						selectedConfiguration={selectedRunConfiguration}
						running={runId !== null}
						lines={runLines}
						exited={runExited}
						onProgramChange={setRunProgramState}
						onArgsChange={setRunArgsState}
						onCwdChange={setRunCwdState}
						onEnvChange={setRunEnvState}
						onSelectConfiguration={handleSelectRunConfiguration}
						onSaveConfiguration={handleSaveRunConfiguration}
						onUpdateConfiguration={handleUpdateRunConfiguration}
						onDeleteConfiguration={handleDeleteRunConfiguration}
						onRun={() => void runs.run()}
						onStop={() => void runs.stop()}
						onClose={runs.closePanel}
						onClearLog={runs.clearLog}
					/>
					<Palettes
						root={root}
						searchOpen={searchOpen}
						quickOpenOpen={quickOpenOpen}
						shortcutsOpen={shortcutsOpen}
						commandOpen={commandPaletteOpen}
						openPaths={new Set(buffers.map((buffer) => buffer.path))}
						commands={commands}
						recentCommands={recentCommands}
						onRecentCommands={setRecentCommands}
						groups={SHORTCUT_GROUPS}
						onOpenMatch={handleOpenMatch}
						onOpenQuick={handleOpenQuick}
						onCloseSearch={closeSearch}
						onCloseQuick={() => setQuickOpenOpen(false)}
						onCloseShortcuts={() => setShortcutsOpen(false)}
						onCloseCommands={() => setCommandPaletteOpen(false)}
					/>
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
								fontFamily={effective.terminalFontFamily}
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

			<AppOverlays
				root={root}
				project={project}
				activePath={activePath}
				counts={counts}
				gitStatus={gitStatusState}
				missingTools={missingTools}
				saveError={saveError}
				caret={
					cursor === null ? null : { line: cursor.line + 1, column: cursor.character + 1 }
				}
				language={languageLabel(activePath)}
				tabSize={effective.editorTabSize}
				server={
					root === null
						? null
						: lspStatus === undefined || lspStatus === null
							? "lsp starting"
							: lspStatus.server
				}
				onOpenSettings={() => setSettingsOpen(true)}
				references={references}
				refsOpen={refsOpen}
				onCloseRefs={() => setRefsOpen(false)}
				onNavigate={handleNavigate}
				gitDiffPath={gitDiffPath}
				onCloseGitDiff={() => setGitDiffPath(null)}
				gitCommitDiffHash={gitCommitDiffHash}
				onCloseCommitDiff={() => setGitCommitDiffHash(null)}
				settingsOpen={settingsOpen}
				settingsTab={settingsTab}
				preferences={preferences}
				projectSettings={projectSettings ?? DEFAULT_PROJECT_SETTINGS}
				onCloseSettings={() => setSettingsOpen(false)}
				onPreferencesChange={setPreferences}
				onProjectSettingsChange={handleProjectSettingsChange}
				onResetPanels={() =>
					setPreferences((current) => ({
						...current,
						panelSizes: DEFAULT_PANEL_SIZES,
					}))
				}
				gotoMode={gotoMode}
				gotoRecent={recentFiles}
				onCloseGoto={() => setGotoMode(null)}
				generateOpen={generateOpen && active !== null}
				generateItems={
					active === null
						? []
						: generateItems(active.path, active.text, cursor?.line ?? 0)
				}
				onPickGenerate={applyGenerate}
				onCloseGenerate={() => setGenerateOpen(false)}
				newProjectOpen={newProjectOpen}
				newProjectParent={newProjectParent}
				onNewProjectParentChange={setNewProjectParent}
				onCloseNewProject={() => setNewProjectOpen(false)}
				onProjectCreated={(nextRoot) => {
					setNewProjectOpen(false);
					void openRoot(nextRoot);
				}}
			/>
		</div>
	);
}
