import { useCallback, useRef, useState } from "react";
import { useDebugSession } from "@/lib/debug/session";
import { useDocumentSync, useLspServer } from "@/lib/lsp/session";
import type { RunConfiguration } from "@/lib/project/api";
import { splitArgs } from "@/lib/run/splitArgs";
import { useTests } from "@/lib/tests/useTests";
import { useBuild } from "@/ui/app/useBuild";
import { useDiagnosticsState } from "@/ui/app/useDiagnosticsState";
import type { EditorHandle } from "@/ui/editor/Editor";
import { useEditorActions } from "@/ui/app/useEditorActions";
import { useGitState } from "@/ui/app/useGitState";
import { useOverlays } from "@/ui/app/useOverlays";
import { usePanels } from "@/ui/app/usePanels";
import { useRunControls } from "@/ui/app/useRunControls";
import { useSaveBuffers } from "@/ui/app/useSaveBuffers";
import { useSettings } from "@/ui/app/useSettings";
import { useShellSnapshot } from "@/ui/app/useShellSnapshot";
import { useAutoOpenDock } from "@/ui/app/useAutoOpenDock";
import { resetProjectState } from "@/ui/app/projectReset";
import { useShellGlue } from "@/ui/app/useShellGlue";
import { useWorkspace } from "@/ui/app/useWorkspace";

export type ShellModel = ReturnType<typeof useShell>;

/**
 * The whole shell, composed.
 *
 * Each hook owns one slice of state; this function only decides the order they depend on each other
 * and derives the handful of values several of them share. The view tree receives this as one prop.
 */
export function useShell() {
	const overlays = useOverlays();
	const panels = usePanels();
	const [notice, setNotice] = useState<string | null>(null);
	const savePathsRef = useRef<(paths: string[]) => Promise<boolean>>(async () => false);
	const projectOpenedRef = useRef<() => void>(() => {});
	const editorRef = useRef<EditorHandle | null>(null);
	const runConfigurationsRef = useRef<RunConfiguration[]>([]);

	const workspace = useWorkspace({
		onNotice: setNotice,
		onProjectOpened: () => projectOpenedRef.current(),
		savePaths: (paths) => savePathsRef.current(paths),
		setRevealTarget: overlays.setRevealTarget,
		setRevealToken: overlays.setRevealToken,
		setReferences: overlays.setReferences,
		setRefsOpen: overlays.setRefsOpen,
		setSearchOpen: overlays.setSearchOpen,
		setQuickOpenOpen: overlays.setQuickOpenOpen,
	});

	const root = workspace.project?.root ?? null;
	const activePath = workspace.activePath;

	const git = useGitState({ root, activePath });
	const runs = useRunControls({
		root,
		initialConfigurations: runConfigurationsRef.current,
		onConfigurationsChange: (next: RunConfiguration[]) => {
			runConfigurationsRef.current = next;
		},
		onNotice: setNotice,
	});
	const settings = useSettings({
		root,
		onNotice: setNotice,
		onOpenSettings: () => panels.setSettingsOpen(true),
	});

	const effective = settings.effective;
	const formatOnSaveRef = useRef(effective.formatOnSave);
	formatOnSaveRef.current = effective.formatOnSave;
	const save = useSaveBuffers({
		root,
		activePath,
		formatting: panels.formatting,
		buffersRef: workspace.buffersRef,
		activePathRef: workspace.activePathRef,
		editorRef,
		formatOnSaveRef,
		setBuffers: workspace.setBuffers,
		setSaving: workspace.setSaving,
		setSaveStatus: panels.setSaveStatus,
		setFormatting: panels.setFormatting,
		onSaved: (path) => git.forgetBlame(path),
		onBatchSaved: () => git.markSaved(),
	});
	savePathsRef.current = save.savePaths;

	const reportNotice = useCallback((message: string) => setNotice(message), []);
	const lspOverrides =
		workspace.project?.kind === "cargo"
			? { path: effective.rustAnalyzerPath, args: splitArgs(effective.rustAnalyzerArgs) }
			: { path: effective.clangdPath, args: splitArgs(effective.clangdArgs) };
	const lspStatus = useLspServer(root, reportNotice, lspOverrides);
	const debug = useDebugSession(root, settings.buildProfile);

	const diagnostics = useDiagnosticsState({ root, onError: reportNotice });
	const active = workspace.buffers.find((buffer) => buffer.path === activePath) ?? null;
	useDocumentSync({
		root,
		path: active?.path ?? null,
		text: active?.text ?? "",
		report: reportNotice,
		ready: lspStatus !== null,
		kind: workspace.project?.kind ?? null,
	});
	const build = useBuild({
		root,
		profile: settings.buildProfile,
		onDiagnostics: diagnostics.setBuildReport,
		onNotice: setNotice,
	});
	const editorActions = useEditorActions({
		root,
		activePath,
		cursor: overlays.cursor,
		debug,
		applyEdits: (edits) => void workspace.handleApplyEdits(edits),
		setBuffers: workspace.setBuffers,
		setFormatting: panels.setFormatting,
		onNotice: setNotice,
		onReferences: (locations) => {
			overlays.setReferences(locations);
			overlays.setRefsOpen(true);
		},
	});
	const tests = useTests(root);
	const panelExpanded = panels.panelOpen ?? diagnostics.counts.errors > 0;
	const missingTools =
		settings.report?.tools.filter((tool) => tool.source === "missing").length ?? 0;
	/** Only a failed save earns a slot in the bar; a successful one is not news. */
	const saveError = panels.saveStatus?.failed === true ? panels.saveStatus.text : null;

	useAutoOpenDock({ errorCount: diagnostics.counts.errors, onOpen: panels.setPanelOpen });

	// Everything that belonged to the previous project, cleared when a new one opens.
	projectOpenedRef.current = () => resetProjectState({ git, panels, overlays, diagnostics });

	const snapshotRef = useShellSnapshot({
		workspace,
		panels,
		activePath,
		runs,
		settings,
	});

	const { commands, runCommand } = useShellGlue({
		workspace,
		overlays,
		panels,
		settings,
		git,
		runs,
		save,
		build,
		editorActions,
		diagnostics,
		debug,
		tests,
		root,
		activePath,
		cursor: overlays.cursor,
		panelExpanded,
		snapshotRef,
	});

	return {
		workspace,
		overlays,
		panels,
		settings,
		git,
		runs,
		save,
		build,
		editorActions,
		diagnostics,
		debug,
		tests,
		lspStatus,
		notice,
		setNotice,
		commands,
		runCommand,
		editorRef,
		root,
		activePath,
		active,
		panelExpanded,
		missingTools,
		saveError,
		effective,
	};
}
