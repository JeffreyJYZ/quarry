import type { FileBuffer } from "@/lib/project/buffer";
import type { ProjectInfo, RunConfiguration, Settings } from "@/lib/project/api";
import type { DockTab } from "@/ui/tests/TestsDock";

/** Everything the shell restores on launch, and writes back while it runs. */
export type SessionSnapshot = {
	project: ProjectInfo | null;
	buffers: FileBuffer[];
	activePath: string | null;
	railCollapsed: boolean;
	gitOpen: boolean;
	panelOpen: boolean | null;
	dockTab: DockTab;
	runConfigurations: RunConfiguration[];
	preferences: Settings["preferences"];
	recentFiles: string[];
	newProjectParent: string;
};

/**
 * The settings file written for a snapshot.
 *
 * Kept apart from the hook so it can be tested for the one mistake this mapping makes easy: a field the
 * shell restores but never writes back. `newProjectParent` was in the snapshot, in the signature and in
 * the restore path, and missing here — so the New Project dialog's folder was remembered by nothing and
 * reset to empty on every launch.
 */
export function settingsFromSnapshot(snapshot: SessionSnapshot): Settings {
	return {
		lastRoot: snapshot.project?.root ?? null,
		openFiles: snapshot.buffers.map((buffer) => buffer.path),
		activeFile: snapshot.activePath,
		railCollapsed: snapshot.railCollapsed,
		gitOpen: snapshot.gitOpen,
		dockTab: snapshot.dockTab as Settings["dockTab"],
		dockExpanded: snapshot.panelOpen,
		runConfigurations: snapshot.runConfigurations,
		preferences: snapshot.preferences,
		recentFiles: snapshot.recentFiles,
		newProjectParent: snapshot.newProjectParent,
	};
}
