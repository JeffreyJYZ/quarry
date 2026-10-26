import type { FileBuffer } from "@/lib/project/buffer";
import type { SessionSnapshot } from "@/ui/app/useSessionPersistence";

/**
 * A cheap change token for a session snapshot.
 *
 * The debounce only needs to know whether anything worth persisting changed, not what the buffers
 * contain — stringifying every buffer on every keystroke would cost the whole document.
 */
export function snapshotSignature(snapshot: SessionSnapshot | null): string {
	if (snapshot === null) return "";
	const buffers = snapshot.buffers
		.map((buffer: FileBuffer) => `${buffer.path}:${buffer.text === buffer.loaded ? 0 : 1}`)
		.join("|");
	return [
		snapshot.project?.root ?? "",
		snapshot.activePath ?? "",
		buffers,
		snapshot.recentFiles.join(","),
		JSON.stringify(snapshot.preferences),
		JSON.stringify(snapshot.runConfigurations),
		snapshot.railCollapsed ? "1" : "0",
		snapshot.debugOpen ? "1" : "0",
		snapshot.gitOpen ? "1" : "0",
		String(snapshot.panelOpen),
		snapshot.dockTab,
		snapshot.newProjectParent,
	].join("\u0000");
}
