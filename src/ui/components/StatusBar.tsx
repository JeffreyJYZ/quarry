import { memo } from "react";
import { plural } from "@/lib/problems/model";
import type { GitStatus, ProjectInfo } from "@/lib/project/api";
import { kindLabel } from "@/lib/project/kind";
import { StatusTools } from "@/ui/components/StatusBarIcons";

export type StatusBarProps = {
	project: ProjectInfo | null;
	git?: GitStatus | null;
	errors: number;
	warnings: number;
	/** Toolchain count that could not be resolved; hidden when zero. */
	missingTools: number;
	/** A failed save's message; success is not news and never lands here. */
	saveError?: string | null;
	/** Caret position, 1-based, or null with no editor. */
	caret?: { line: number; column: number } | null;
	/** File extension shown as a language chip, e.g. "rust" or "c++". */
	language?: string | null;
	/** Indent width the editor is using. */
	tabSize?: number;
	/** Language server name once it is up, "starting" while it comes up, "unavailable" when it failed. */
	server?: string | null;
	onOpenSettings: () => void;
	/** Which regions the icon row reports as open. */
	railCollapsed: boolean;
	terminalOpen: boolean;
	panelExpanded: boolean;
	gitOpen: boolean;
	debuggerActive: boolean;
	building: boolean;
	running: boolean;
	onToggleRail: () => void;
	onToggleTerminal: () => void;
	onTogglePanel: () => void;
	onToggleGit: () => void;
	onShowDebugger: () => void;
	onBuild: () => void;
	onRun: () => void;
	onStop: () => void;
};

/**
 * The bottom bar.
 *
 * It carries four facts and two controls: where you are, what git says, what the diagnostics count,
 * the icon row for the panels, Build/Run, and the settings button. Everything else — the version, the
 * language-server name, the toolchain list, the last save message — lives somewhere the eye is
 * already going, so it does not sit here.
 */
export default function StatusBar({
	project,
	git = null,
	errors,
	warnings,
	missingTools,
	saveError = null,
	caret = null,
	language = null,
	tabSize = 4,
	server = null,
	onOpenSettings,
	railCollapsed,
	terminalOpen,
	panelExpanded,
	gitOpen,
	debuggerActive,
	building,
	running,
	onToggleRail,
	onToggleTerminal,
	onTogglePanel,
	onToggleGit,
	onShowDebugger,
	onBuild,
	onRun,
	onStop,
}: StatusBarProps) {
	const gitSegment =
		project !== null && git !== null && git.branch !== null ? (
			<span
				className="status-git"
				title={`${git.branch} · ${git.ahead} ahead · ${git.behind} behind · ${git.entries.length} changes`}
			>
				<span className="status-branch">
					<span className="branch-glyph" aria-hidden="true" />
					<span className="branch-name">{git.branch}</span>
				</span>
				{git.ahead > 0 ? <span className="status-ahead">↑{git.ahead}</span> : null}
				{git.behind > 0 ? <span className="status-behind">↓{git.behind}</span> : null}
				{git.entries.length > 0 ? (
					<span className="status-changes">{plural(git.entries.length, "change")}</span>
				) : null}
			</span>
		) : null;

	return (
		<footer className="statusbar">
			<span className="status-left-group">
				<StatusTools
					railCollapsed={railCollapsed}
					terminalOpen={terminalOpen}
					panelExpanded={panelExpanded}
					gitOpen={gitOpen}
					debuggerActive={debuggerActive}
					building={building}
					running={running}
					hasProject={project !== null}
					onToggleRail={onToggleRail}
					onToggleTerminal={onToggleTerminal}
					onTogglePanel={onTogglePanel}
					onToggleGit={onToggleGit}
					onShowDebugger={onShowDebugger}
					onBuild={onBuild}
					onRun={onRun}
					onStop={onStop}
				/>
				<span className="status-left" title={project?.root}>
					{project === null
						? "no project"
						: `${project.name} · ${kindLabel(project.kind)}`}
				</span>
			</span>
			<span className="status-middle">
				{gitSegment}
				{errors > 0 || warnings > 0 ? (
					<>
						<span className="sep">·</span>
						<span className={errors > 0 ? "count error" : "count"}>
							{plural(errors, "error")}
						</span>
						<span className="sep">·</span>
						<span className={warnings > 0 ? "count warning" : "count"}>
							{plural(warnings, "warning")}
						</span>
					</>
				) : null}
			</span>
			<span className="status-right">
				{server === null ? null : (
					<span className="status-server" title="Language server">
						{server}
					</span>
				)}
				<CaretSegment caret={caret} />
				{language === null ? null : (
					<span className="status-language" title="Language">
						{language}
					</span>
				)}
				<span className="status-indent" title="Indent width">
					{tabSize} spaces
				</span>
				{missingTools > 0 ? (
					<span className="tool missing" title="Install the missing toolchains">
						{missingTools} missing
					</span>
				) : null}
				{saveError === null ? null : (
					<span className="status-save error" title={saveError}>
						{saveError}
					</span>
				)}
				<button
					type="button"
					className="status-settings status-icon"
					aria-label="Settings"
					title="Settings (⌘,)"
					onClick={onOpenSettings}
				>
					⚙
				</button>
			</span>
		</footer>
	);
}

const CaretSegment = memo(function CaretSegment({
	caret,
}: {
	caret: { line: number; column: number } | null;
}) {
	if (caret === null) return null;
	return (
		<span className="status-caret" title="Caret position">
			{caret.line}:{caret.column}
		</span>
	);
});
