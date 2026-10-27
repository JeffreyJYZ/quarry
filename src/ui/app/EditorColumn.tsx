import { useEffect, type CSSProperties } from "react";
import { setDisassemblyOpener } from "@/lib/debug/disasm";
import EditorStage from "@/ui/app/EditorStage";
import { Palettes } from "@/ui/app/BottomDock";
import CanvasPanels from "@/ui/app/CanvasPanels";
import { SHORTCUT_GROUPS } from "@/ui/app/shellShortcuts";
import type { ShellModel } from "@/ui/app/useShell";
import { activeFrame, disasmAddressOf } from "@/ui/debug/dock/addresses";

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
				disasm={
					panels.disasmOpen
						? {
								session: model.debug.sessionId,
								address: disasmAddressOf(model.debug),
								frameId: activeFrame(model.debug.stopView)?.id ?? null,
								onClose: () => panels.setDisasmOpen(false),
							}
						: null
				}
				project={workspace.project}
				root={model.root}
				active={model.active}
				activePath={model.activePath}
				buffers={workspace.buffers}
				saving={workspace.saving}
				confirmClose={workspace.confirmClose}
				cursor={overlays.cursor}
				effective={settings.effective}
				editorRef={model.editorRef}
				diagnostics={diagnostics.diagnostics}
				breakpointLines={editorActions.breakpointLines}
				unverifiedLines={editorActions.unverifiedLines}
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
				openPaths={new Set(workspace.buffers.map((buffer) => buffer.path))}
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
