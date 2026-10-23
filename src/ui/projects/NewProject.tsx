import type { JSX } from "react";
import "@/ui/projects/newProject.css";
import { KindPicker } from "./KindPicker";
import { StandardPicker } from "./StandardPicker";
import { useScaffold } from "./useScaffold";

export type NewProjectProps = {
	open: boolean;
	/** Where the dialog starts: the location used last time, remembered in settings. */
	initialParent: string;
	onParentChange: (parent: string) => void;
	onClose: () => void;
	/** Called with the new project's root once the scaffold exists on disk. */
	onCreated: (root: string) => void;
};

/**
 * New project dialog: pick a parent directory, a name and a kind, then let the backend scaffold it.
 *
 * The dialog never creates anything itself; it calls `create_project` and hands the resulting root to
 * the caller, which opens it through the ordinary open path so recent projects and settings follow.
 */
export default function NewProject({
	open: isOpen,
	initialParent,
	onParentChange,
	onClose,
	onCreated,
}: NewProjectProps): JSX.Element | null {
	const scaffold = useScaffold({ open: isOpen, initialParent, onParentChange, onCreated });
	const { parent, name, kind, standard, creating, error, target, canCreate } = scaffold;

	if (!isOpen) return null;

	return (
		<div
			className="newproject-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="newproject-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="newproject-title"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					}
				}}
			>
				<header className="newproject-head">
					<span className="label" id="newproject-title">
						new project
					</span>
					<button type="button" className="newproject-close" onClick={onClose}>
						close
					</button>
				</header>

				<div className="newproject-body">
					<div className="newproject-row">
						<label htmlFor="newproject-parent">Location</label>
						<div className="newproject-location">
							<input
								id="newproject-parent"
								ref={scaffold.parentRef}
								type="text"
								value={parent}
								placeholder="/path/to/parent"
								spellCheck={false}
								onChange={(event) => scaffold.chooseParent(event.target.value)}
							/>
							<button
								type="button"
								className="button"
								onClick={() => void scaffold.browse()}
							>
								Browse
							</button>
						</div>
					</div>

					<div className="newproject-row">
						<label htmlFor="newproject-name">Name</label>
						<input
							id="newproject-name"
							ref={scaffold.nameRef}
							type="text"
							value={name}
							placeholder="my-project"
							spellCheck={false}
							onChange={(event) => scaffold.setName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void scaffold.submit();
							}}
						/>
					</div>

					<KindPicker kind={kind} onSelect={scaffold.selectKind} />

					<StandardPicker
						kind={kind}
						standard={standard}
						onSelect={scaffold.setStandard}
					/>

					<p className="newproject-target">{target ?? "Choose a location and a name"}</p>
					{error === null ? null : (
						<p className="newproject-error" role="alert">
							{error}
						</p>
					)}
				</div>

				<footer className="newproject-foot">
					<span className="newproject-hint">
						Creates the folder and starter files, then opens it.
					</span>
					<div className="newproject-actions">
						<button type="button" className="button" onClick={onClose}>
							Cancel
						</button>
						<button
							type="button"
							className="button newproject-create"
							disabled={!canCreate}
							onClick={() => void scaffold.submit()}
						>
							{creating ? "Creating…" : "Create project"}
						</button>
					</div>
				</footer>
			</div>
		</div>
	);
}
