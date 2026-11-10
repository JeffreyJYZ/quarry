import { useCallback } from "react";
import type { RefObject } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { type FileEntry, readTextFile } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { encodingNotice } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";

/** The most a recents list keeps; the tail is noise nobody scrolls to. */
const RECENTS_LIMIT = 20;

/**
 * Opening a project or a file.
 *
 * Split out of `useWorkspace` because that hook is at the file-size limit and this is one job: pick a
 * folder, or turn a path into a buffer without opening a second tab for a file already open.
 */
export function useFileOpening(input: {
	options: {
		onNotice: (message: string | null) => void;
		setRevealTarget: (target: null) => void;
	};
	buffersRef: RefObject<FileBuffer[]>;
	mountedRef: RefObject<boolean>;
	reading: RefObject<Set<string>>;
	setBuffers: (update: (current: FileBuffer[]) => FileBuffer[]) => void;
	setActivePath: (path: string | null) => void;
	setRecentFiles: (update: (current: string[]) => string[]) => void;
	openRoot: (root: string) => Promise<void>;
}): {
	openPath: (path: string, name: string) => Promise<void>;
	handleOpenFile: (entry: FileEntry) => void;
	handleOpenProject: () => Promise<void>;
} {
	const { options, buffersRef, mountedRef, reading, setBuffers, setActivePath, setRecentFiles } =
		input;

	const openPath = useCallback(
		async (path: string, name: string) => {
			setRecentFiles((current) =>
				[path, ...current.filter((entry) => entry !== path)].slice(0, RECENTS_LIMIT),
			);
			if (buffersRef.current.some((buffer) => buffer.path === path)) {
				setActivePath(path);
				return;
			}
			if (reading.current.has(path)) return;
			reading.current.add(path);
			try {
				const file = await readTextFile(path);
				if (!mountedRef.current) return;
				setBuffers((current) =>
					current.some((buffer) => buffer.path === path)
						? current
						: [
								...current,
								{
									path,
									name,
									text: file.text,
									loaded: file.text,
									encoding: file.encoding,
								},
							],
				);
				setActivePath(path);
				options.onNotice(encodingNotice(name, file.encoding));
			} catch (error) {
				if (mountedRef.current)
					options.onNotice(`Could not open ${name}: ${describeError(error)}`);
			} finally {
				reading.current.delete(path);
			}
		},
		[options, buffersRef, mountedRef, reading, setBuffers, setActivePath, setRecentFiles],
	);

	const handleOpenFile = useCallback(
		(entry: FileEntry) => {
			options.setRevealTarget(null);
			void openPath(entry.path, entry.name);
		},
		[openPath, options],
	);

	const handleOpenProject = useCallback(async () => {
		try {
			const picked = await open({ directory: true, multiple: false, title: "Open project" });
			const nextRoot = typeof picked === "string" ? picked : null;
			if (nextRoot !== null) await input.openRoot(nextRoot);
		} catch (error) {
			options.onNotice(describeError(error));
		}
	}, [input, options]);

	return { openPath, handleOpenFile, handleOpenProject };
}
