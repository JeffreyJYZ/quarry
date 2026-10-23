import type { ProjectInfo } from "@/lib/project/api";
import { kindLabel } from "@/lib/project/kind";

export type WelcomeProps = {
	project: ProjectInfo | null;
};

/** Empty canvas state: shown whenever no buffer is active. */
export default function Welcome({ project }: WelcomeProps) {
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
				<p className="note">
					{project
						? "Cmd+S saves and formats through the project's own formatter; Cmd+Alt+S saves every dirty tab."
						: "Opening a folder starts its language server, so errors and warnings appear as you read."}
				</p>
			</div>
		</div>
	);
}
