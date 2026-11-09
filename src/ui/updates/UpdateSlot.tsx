import { useState } from "react";
import { useUpdates } from "@/lib/updates/state";
import { restartWithUpdate } from "@/lib/updates/store";
import { Suspense, lazy } from "react";
const ReleaseNotes = lazy(() => import("@/ui/updates/ReleaseNotes"));
import "@/ui/updates/updates.css";

/**
 * The title-bar update slot.
 *
 * Once an update is ready it offers the restart, and the notes for that version sit behind a toggle
 * beside it: the moment to decide whether to restart is the moment to read what changed.
 */
export default function UpdateSlot() {
	const state = useUpdates();
	const [notesOpen, setNotesOpen] = useState(false);
	if (state.phase === "downloading") {
		return <span className="update-slot-status">Downloading…</span>;
	}
	if (state.phase !== "ready") return null;
	const version = state.offer?.version ?? "";
	return (
		<div className="update-slot">
			<button
				type="button"
				className="update-slot-restart"
				title={`Restart quarry to install version ${version}`}
				onClick={() => void restartWithUpdate()}
			>
				Restart to update {version}
			</button>
			<button
				type="button"
				className="update-slot-notes-toggle"
				aria-expanded={notesOpen}
				onClick={() => setNotesOpen((current) => !current)}
			>
				What's new
			</button>
			{notesOpen ? (
				<Suspense fallback={null}>
					<ReleaseNotes version={version} variant="inline" />
				</Suspense>
			) : null}
		</div>
	);
}
