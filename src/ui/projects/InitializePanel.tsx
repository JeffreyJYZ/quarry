import { type JSX, useState } from "react";
import { type ProjectInfo, initProject } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import "@/ui/projects/initialize.css";
import "@/ui/projects/newProject.css";
import { KindPicker } from "./KindPicker";
import { StandardPicker } from "./StandardPicker";
import { type Kind, defaultStandard } from "./kinds";

export type InitializePanelProps = {
	/** The folder the user opened, which becomes the project root in place. */
	root: string;
	onInitialized: (info: ProjectInfo) => void;
	onNotice: (message: string | null) => void;
	/** The backend call; injectable so a test can answer without a Tauri runtime. */
	init?: (root: string, kind: Kind, standard: string) => Promise<ProjectInfo>;
};

/**
 * Empty canvas state for an opened folder with no project marker.
 *
 * The kinds and their standards come from the new-project dialog, so this panel offers exactly the
 * same four choices. The backend owns the emptiness check and returns an inspected project, which
 * the shell activates through the ordinary project-open path.
 */
export default function InitializePanel({
	root,
	onInitialized,
	onNotice,
	init = initProject,
}: InitializePanelProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const [kind, setKind] = useState<Kind>("rust-bin");
	const [standard, setStandard] = useState(defaultStandard("rust-bin"));
	const [initializing, setInitializing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const selectKind = (next: Kind) => {
		setKind(next);
		setStandard(defaultStandard(next));
	};

	const initialize = async () => {
		setInitializing(true);
		setError(null);
		onNotice(null);
		try {
			const info = await init(root, kind, standard);
			onInitialized(info);
		} catch (cause) {
			const message = describeError(cause);
			setError(message);
			onNotice(message);
		} finally {
			setInitializing(false);
		}
	};

	return (
		<div className="init-wrap">
			<section className="init-panel" aria-labelledby="init-title">
				<h1 id="init-title">This folder is not a project</h1>
				<p>
					quarry found no Cargo.toml, CMakeLists.txt or compile_commands.json here.
					Initialize the folder to start a project in place.
				</p>
				{expanded ? (
					<div className="init-form">
						<KindPicker kind={kind} onSelect={selectKind} />
						<StandardPicker kind={kind} standard={standard} onSelect={setStandard} />
						{error === null ? null : (
							<p className="newproject-error" role="alert">
								{error}
							</p>
						)}
						<div className="init-actions">
							<button
								type="button"
								className="button"
								onClick={() => setExpanded(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button init-primary"
								disabled={initializing}
								onClick={() => void initialize()}
							>
								{initializing ? "Initializing…" : "Initialize"}
							</button>
						</div>
					</div>
				) : (
					<button
						type="button"
						className="button init-primary"
						onClick={() => setExpanded(true)}
					>
						Initialize project
					</button>
				)}
			</section>
		</div>
	);
}
