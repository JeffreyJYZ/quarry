import type { ProjectInfo } from "@/project/api";
import { kindLabel } from "@/project/kind";

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
					No save yet in this build; edits stay in memory for the session.
				</p>
			</div>
		</div>
	);
}
