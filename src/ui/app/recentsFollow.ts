/**
 * What the recents list and the active tab do when a file disappears or moves on disk.
 *
 * Kept out of `useWorkspace` because it is plain list surgery, and because the two callbacks there
 * pushed that hook over the file-size limit.
 */

/** Recents without the path that no longer exists. */
export function recentsWithout(recents: string[], path: string): string[] {
	return recents.filter((entry) => entry !== path);
}

/** Recents with `from` replaced by `to`, so a moved file is still one click away under its new name. */
export function recentsMoved(recents: string[], from: string, to: string): string[] {
	return recents.map((entry) => (entry === from ? to : entry));
}

/** The two handlers a closed or moved buffer needs, wired to the shell's setters. */
export function followExternalChanges(input: {
	activePath: () => string | null;
	setActivePath: (path: string | null) => void;
	setRecentFiles: (update: (current: string[]) => string[]) => void;
}): { onClosed: (path: string) => void; onMoved: (from: string, to: string) => void } {
	return {
		onClosed: (path) => {
			input.setRecentFiles((current) => recentsWithout(current, path));
			if (input.activePath() === path) input.setActivePath(null);
		},
		onMoved: (from, to) => {
			input.setRecentFiles((current) => recentsMoved(current, from, to));
			if (input.activePath() === from) input.setActivePath(to);
		},
	};
}
