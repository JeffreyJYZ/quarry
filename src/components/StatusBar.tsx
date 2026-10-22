import { Fragment, type ReactNode } from "react";
import { plural } from "@/problems/model";
import type { GitStatus, ProjectInfo, ToolchainReport } from "@/project/api";
import { kindLabel } from "@/project/kind";

export type StatusBarProps = {
	version: string;
	project: ProjectInfo | null;
	report: ToolchainReport | null;
	reportFailed: boolean;
	git?: GitStatus | null;
	/** Middle slot, after the project line: language server, diagnostic totals, last build. */
	extra?: ReactNode;
};

export default function StatusBar({
	version,
	project,
	report,
	reportFailed,
	git = null,
	extra,
}: StatusBarProps) {
	const missing = report ? report.tools.filter((tool) => tool.source === "missing").length : 0;
	const middle = project
		? `${project.name} · ${kindLabel(project.kind)} · ${project.buildRoot}`
		: "no project";
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
			<span className="status-left">quarry {version || "0.1.0"}</span>
			<span className="status-middle" title={middle}>
				<span className="status-project">{middle}</span>
				{gitSegment}
				{extra ? <span className="status-extra">{extra}</span> : null}
			</span>
			<span className="status-right">
				{report ? (
					<>
						{report.tools.map((tool, index) => (
							<Fragment key={tool.name}>
								{index > 0 ? <span className="sep">·</span> : null}
								{tool.source === "missing" ? (
									<span className="tool missing">{tool.name}?</span>
								) : (
									<span className="tool">{tool.name}</span>
								)}
							</Fragment>
						))}
						{report.tools.length > 0 ? <span className="sep">·</span> : null}
						<span className="tool-count">{missing} missing</span>
					</>
				) : (
					<span className="tool-count">
						{reportFailed ? "toolchains unavailable" : "probing toolchains..."}
					</span>
				)}
			</span>
		</footer>
	);
}
