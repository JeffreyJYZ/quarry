import type { ShellModel } from "@/ui/app/useShell";

/**
 * What a newly opened project clears.
 *
 * Anything keyed to the previous root goes: its diff, its build log position, its diagnostics and
 * the panels a user opened for it. Preferences and run configurations survive.
 */
export function resetProjectState(
	shell: Pick<ShellModel, "git" | "panels" | "overlays" | "diagnostics">,
): void {
	const { git, panels, overlays, diagnostics } = shell;
	git.setRefreshToken((current) => current + 1);
	panels.setGitDiffPath(null);
	panels.setGitCommitDiffHash(null);
	panels.setSaveStatus(null);
	panels.setPanelOpen(null);
	overlays.setSearchOpen(false);
	overlays.setShortcutsOpen(false);
	panels.setDebugOpen(false);
	diagnostics.reset();
}
