import { plural } from "@/problems/model";
import type { GitStatus, ProjectInfo } from "@/project/api";
import { kindLabel } from "@/project/kind";

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
};

/**
 * The bottom bar.
 *
 * It carries four facts and one control: where you are, what git says, what the diagnostics count,
 * and the settings button. Everything else — the version, the language-server name, the toolchain
 * list, the last save message — lives somewhere the eye is already going, so it does not sit here.
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
			<span className="status-left" title={project?.root}>
				{project === null ? "no project" : `${project.name} · ${kindLabel(project.kind)}`}
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
				{caret === null ? null : (
					<span className="status-caret" title="Caret position">
						{caret.line}:{caret.column}
					</span>
				)}
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
					className="status-settings"
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
