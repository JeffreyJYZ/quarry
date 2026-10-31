import { useCallback } from "react";
import type { FileBuffer } from "@/lib/project/buffer";
import { nextTabPath } from "@/lib/editor/tabs";

/**
 * The two tab actions the keyboard needs, taken from the workspace it already owns.
 *
 * Closing goes through the workspace's own close, so a dirty buffer still asks before it is thrown
 * away instead of the shortcut quietly doing something the tab's × would not.
 */
export function useTabKeys(workspace: {
	buffers: FileBuffer[];
	activePath: string | null;
	setActivePath: (path: string | null) => void;
	handleClose: (path: string) => void;
}) {
	const closeActiveTab = useCallback(() => {
		if (workspace.activePath !== null) workspace.handleClose(workspace.activePath);
	}, [workspace.activePath, workspace.handleClose]);

	const cycleTab = useCallback(
		(step: number) => {
			const next = nextTabPath(workspace.buffers, workspace.activePath, step);
			if (next !== null) workspace.setActivePath(next);
		},
		[workspace.buffers, workspace.activePath, workspace.setActivePath],
	);

	return { closeActiveTab, cycleTab };
}
