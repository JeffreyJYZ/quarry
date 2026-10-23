import type { CSSProperties } from "react";
import EditorStage from "@/ui/app/EditorStage";
import { Palettes } from "@/ui/app/BottomDock";
import RunSection from "@/ui/app/RunSection";
import CanvasPanels from "@/ui/app/CanvasPanels";
import { SHORTCUT_GROUPS } from "@/ui/app/shellShortcuts";
import type { ShellModel } from "@/ui/app/useShell";

/** The editor column: the tabs and surfaces, then the bottom slot and the palettes over it. */
export default function EditorColumn({ model }: { model: ShellModel }) {
	const { workspace, overlays, settings, runs, diagnostics, editorActions, git } = model;
	const { dockHeight, terminalHeight } = settings.panels;

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
			<RunSection
				root={model.root}
				open={runs.panelOpen}
				program={runs.program}
				args={runs.args}
				cwd={runs.cwd}
				env={runs.env}
				configurations={runs.configurations}
				selectedConfiguration={runs.selected}
				running={runs.running !== null}
				lines={runs.lines}
				exited={runs.exited}
				onProgramChange={runs.setProgram}
				onArgsChange={runs.setArgs}
				onCwdChange={runs.setCwd}
				onEnvChange={runs.setEnv}
				onSelectConfiguration={runs.select}
				onSaveConfiguration={runs.save}
				onUpdateConfiguration={runs.update}
				onDeleteConfiguration={runs.remove}
				onRun={() => void runs.run()}
				onStop={() => void runs.stop()}
				onClose={runs.closePanel}
				onClearLog={runs.clearLog}
			/>
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
