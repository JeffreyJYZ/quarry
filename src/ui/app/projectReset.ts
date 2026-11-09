import type { ShellModel } from "@/ui/app/useShell";
import { forgetClosed } from "@/lib/editor/closedTabs";

/**
 * What a newly opened project clears.
 *
 * Anything keyed to the previous root goes: its diff, its build log position, its diagnostics, the
 * panels a user opened for it, and its run configurations. Preferences survive — they describe the
 * person, not the project. A run configuration does not: it carries a `program` and a `cwd` that
 * point into the project that was open when it was written, so keeping it means Run launches the old
 * project's binary against the new tree.
 */
export function resetProjectState(
	shell: Pick<ShellModel, "git" | "panels" | "overlays" | "diagnostics" | "runs">,
): void {
	const { git, panels, overlays, diagnostics, runs } = shell;
	git.setRefreshToken((current) => current + 1);
	panels.setGitDiffPath(null);
	panels.setGitCommitDiffHash(null);
	panels.setSaveStatus(null);
	panels.setPanelOpen(null);
	overlays.setSearchOpen(false);
	overlays.setShortcutsOpen(false);
	diagnostics.reset();
	runs.replaceConfigurations([]);
	// Ctrl+Shift+T must not restore a buffer from the project that was just closed.
	forgetClosed();
}
