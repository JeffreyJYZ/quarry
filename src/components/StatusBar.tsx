import { Fragment } from "react";
import type { ProjectInfo, ToolchainReport } from "@/project/api";
import { kindLabel } from "@/project/kind";

export type StatusBarProps = {
	version: string;
	project: ProjectInfo | null;
	report: ToolchainReport | null;
	reportFailed: boolean;
};

export default function StatusBar({ version, project, report, reportFailed }: StatusBarProps) {
	const missing = report ? report.tools.filter((tool) => tool.source === "missing").length : 0;
	const middle = project
		? `${project.name} · ${kindLabel(project.kind)} · ${project.buildRoot}`
		: "no project";

	return (
		<footer className="statusbar">
			<span className="status-left">quarry {version || "0.1.0"}</span>
			<span className="status-middle" title={middle}>
				{middle}
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
