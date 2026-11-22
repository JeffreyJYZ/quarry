import { type Dispatch, type SetStateAction, useCallback } from "react";
import { type ProjectInfo, openProject, rememberRoot } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { startupMark } from "@/lib/startupMarks";
import type { FileBuffer } from "@/lib/project/buffer";

export type ActivationOptions = {
	onNotice: (message: string | null) => void;
	onProjectOpened: () => void;
	setProject: (project: ProjectInfo | null) => void;
	setBuffers: Dispatch<SetStateAction<FileBuffer[]>>;
	setActivePath: (path: string | null) => void;
	setConfirmClose: (path: string | null) => void;
	setRecentFiles: Dispatch<SetStateAction<string[]>>;
	setRecentRoots: Dispatch<SetStateAction<string[]>>;
	setOpening: (opening: boolean) => void;
};

/**
 * The one place an inspected `ProjectInfo` becomes the open project.
 *
 * Opening a folder inspects it through `open_project` and lands here; initializing an empty folder
 * already has the inspected info from `init_project` and lands here too. Sharing this path is what
 * makes the tree, status bar and language servers pick up a new project without a restart.
 */
export function useProjectActivation(options: ActivationOptions) {
	const activate = useCallback(
		async (info: ProjectInfo, openedRoot: string) => {
			options.setProject(info);
			options.setBuffers([]);
			options.setActivePath(null);
			options.setConfirmClose(null);
			options.setRecentFiles([]);
			options.onProjectOpened();
			try {
				options.setRecentRoots(await rememberRoot(openedRoot));
			} catch {
				/* the recents list is a convenience, not a dependency */
			}
			startupMark("project-open");
		},
		[options],
	);

	const openRoot = useCallback(
		async (nextRoot: string) => {
			options.setOpening(true);
			options.onNotice(null);
			try {
				const info = await openProject(nextRoot);
				await activate(info, nextRoot);
			} catch (error) {
				options.onNotice(`Could not open ${nextRoot}: ${describeError(error)}`);
				options.setRecentRoots((current) => current.filter((entry) => entry !== nextRoot));
			} finally {
				options.setOpening(false);
			}
		},
		[options, activate],
	);

	return { openRoot, activate };
}
