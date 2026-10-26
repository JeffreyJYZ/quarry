import { useUpdates } from "@/lib/updates/state";
import { restartWithUpdate } from "@/lib/updates/store";
import "@/ui/updates/updates.css";

export default function UpdateSlot() {
	const state = useUpdates();
	if (state.phase === "downloading") {
		return <span className="update-slot-status">Downloading…</span>;
	}
	if (state.phase !== "ready") return null;
	const version = state.offer?.version ?? "";
	return (
		<button
			type="button"
			className="update-slot-restart"
			title={`Restart quarry to install version ${version}`}
			onClick={() => void restartWithUpdate()}
		>
			Restart to update {version}
		</button>
	);
}
