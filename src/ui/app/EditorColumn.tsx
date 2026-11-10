import { useEffect, type CSSProperties } from "react";
import { setDisassemblyOpener } from "@/lib/debug/disasm";
import type { TestMarker } from "@/lib/tests/gutter";
import EditorStage from "@/ui/app/EditorStage";
import { Palettes } from "@/ui/app/BottomDock";
import CanvasPanels from "@/ui/app/CanvasPanels";
import { SHORTCUT_GROUPS } from "@/ui/app/shellShortcuts";
import { useDisasmSplit, useOpenPaths } from "@/ui/app/useStableProps";
import { useTestMarkers } from "@/ui/tests/useTestMarkers";
import type { ShellModel } from "@/ui/app/useShell";

/** The editor column: the tabs and surfaces, then the bottom slot and the palettes over it. */
export default function EditorColumn({ model }: { model: ShellModel }) {
	const { workspace, overlays, settings, diagnostics, editorActions, git, panels } = model;
	const { dockHeight, terminalHeight } = settings.panels;

	// The dock's frame rows open the split through this registry; it is the shell's one owner of
	// "what is open", so the dock never needs a setter drilled through its columns.
	const openSplit = panels.setDisasmOpen;
	useEffect(() => {
		setDisassemblyOpener(() => openSplit(true));
		return () => setDisassemblyOpener(null);
	}, [openSplit]);

	// Both keep their identity until the data behind them changes, so a keystroke does not hand the
	// palettes a new path set or the split a new prop object.
	const openPaths = useOpenPaths(workspace.buffers);
	const testMarkers = useTestMarkers({
		path: model.activePath,
		text: model.active?.text ?? "",
		items: model.tests.items,
		results: model.tests.results,
		running: model.tests.running,
	});
	/** A click runs the test; a right-click, or the module's own marker, runs the whole group. */
	const runTestMarker = (marker: TestMarker, group: boolean) => {
		if (group || marker.kind === "group") model.tests.runAll(marker.group);
		else model.tests.runOne(marker.name);
		model.panels.showTests();
	};
	const disasm = useDisasmSplit({
		open: panels.disasmOpen,
		width: panels.disasmWidth,
		debug: model.debug,
		onWidthChange: panels.setDisasmWidth,
		setOpen: panels.setDisasmOpen,
	});

	return (
		<main
			className="canvas"
			style={
				{
					"--dock-height": `${dockHeight}px`,
					"--terminal-height": `${terminalHeight}px`,
				} as CSSProperties
			}
		>
			<EditorStage
				disasm={disasm}
				project={workspace.project}
				root={model.root}
				active={model.active}
				activePath={model.activePath}
				buffers={workspace.buffers}
				recentRoots={workspace.recentRoots}
				onOpenRecent={(root) => void workspace.openRoot(root)}
				onOpenProject={() => void workspace.handleOpenProject()}
				saving={workspace.saving}
				confirmClose={workspace.confirmClose}
				cursor={overlays.cursor}
				effective={settings.effective}
				editorRef={model.editorRef}
				diagnostics={diagnostics.diagnostics}
				breakpointLines={editorActions.breakpointLines}
				unverifiedLines={editorActions.unverifiedLines}
				testMarkers={testMarkers}
				onTestMarker={runTestMarker}
				blameOn={git.blameOn}
				blameByPath={git.blameByPath}
				revealTarget={overlays.revealTarget}
				revealToken={overlays.revealToken}
				onActivate={workspace.handleActivate}
				onClose={workspace.handleClose}
				onSaveClose={workspace.handleSaveClose}
				onDiscardClose={workspace.handleDiscardClose}
				onCancelClose={workspace.handleCancelClose}
				onChange={workspace.handleChange}
				onNavigate={workspace.handleNavigate}
				onReferences={editorActions.handleReferences}
				onCursor={overlays.setCursor}
				onApplyEdits={workspace.handleApplyEdits}
				onToggleBreakpoint={editorActions.handleToggleBreakpoint}
				onNotice={model.setNotice}
			/>
			<CanvasPanels model={model} />
			<Palettes
				root={model.root}
				searchOpen={overlays.searchOpen}
				quickOpenOpen={overlays.quickOpenOpen}
				shortcutsOpen={overlays.shortcutsOpen}
				commandOpen={overlays.commandPaletteOpen}
				openPaths={openPaths}
				buffers={workspace.buffers}
				commands={model.commands}
				recentCommands={overlays.recentCommands}
				onRecentCommands={overlays.setRecentCommands}
				groups={SHORTCUT_GROUPS}
				onOpenMatch={workspace.handleOpenMatch}
				onOpenQuick={workspace.handleOpenQuick}
				onCloseSearch={() => overlays.setSearchOpen(false)}
				onCloseQuick={() => overlays.setQuickOpenOpen(false)}
				onCloseShortcuts={() => overlays.setShortcutsOpen(false)}
				onCloseCommands={() => overlays.setCommandPaletteOpen(false)}
			/>
		</main>
	);
}
