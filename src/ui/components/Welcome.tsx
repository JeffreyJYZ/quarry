import type { ProjectInfo } from "@/lib/project/api";
import { kindLabel } from "@/lib/project/kind";

export type WelcomeProps = {
	project: ProjectInfo | null;
	/** Projects opened before, newest first; empty on a first run. */
	recent?: string[];
	onOpenRecent?: (root: string) => void;
	onOpenProject?: () => void;
};

/** The last two segments of a path, which is what tells two projects apart. */
function shortRoot(root: string): string {
	const parts = root.split("/").filter((part) => part !== "");
	return parts.slice(-2).join("/") || root;
}

/**
 * Empty canvas state: shown whenever no buffer is active.
 *
 * With no project it is the way back in: the projects opened before are one click away, which is
 * what makes reopening yesterday's work cheaper than finding the folder again.
 */
export default function Welcome({
	project,
	recent = [],
	onOpenRecent,
	onOpenProject,
}: WelcomeProps) {
	return (
		<div className="welcome-wrap">
			<div className="welcome">
				<h1>{project ? "No file open" : "Open a project to begin"}</h1>
				<p>
					{project
						? "Pick a file in the explorer. Each tab keeps its own in-memory text, so switching tabs never loses an edit."
						: "quarry works on Rust and C/C++ folders. Choose a folder that holds a Cargo.toml, a CMakeLists.txt or a compile_commands.json."}
				</p>
				{project ? (
					<ul className="stack">
						<li>
							<span className="key">root</span>
							<span className="value" title={project.root}>
								{project.root}
							</span>
						</li>
						<li>
							<span className="key">kind</span>
							<span className="value">{kindLabel(project.kind)}</span>
						</li>
						<li>
							<span className="key">build root</span>
							<span className="value" title={project.buildRoot}>
								{project.buildRoot}
							</span>
						</li>
					</ul>
				) : null}
				{project === null && recent.length > 0 ? (
					<div className="welcome-recent">
						<span className="label">recent projects</span>
						<ul>
							{recent.slice(0, 6).map((root) => (
								<li key={root}>
									<button
										type="button"
										className="welcome-recent-row"
										title={root}
										onClick={() => onOpenRecent?.(root)}
									>
										<span className="welcome-recent-name">
											{shortRoot(root)}
										</span>
										<span className="welcome-recent-path">{root}</span>
									</button>
								</li>
							))}
						</ul>
					</div>
				) : null}
				{project === null && onOpenProject !== undefined ? (
					<button type="button" className="welcome-open" onClick={onOpenProject}>
						Open project
					</button>
				) : null}
				<p className="note">
					{project
						? "Cmd+S saves and formats through the project's own formatter; Cmd+Alt+S saves every dirty tab."
						: "Opening a folder starts its language server, so errors and warnings appear as you read."}
				</p>
			</div>
		</div>
	);
}
