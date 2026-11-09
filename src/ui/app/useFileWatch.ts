import { useEffect, useRef, useState } from "react";
import { onFsChanged, startWatch, stopWatch } from "@/lib/project/api";
import type { WatchBatch } from "@/lib/project/watch";

/**
 * One filesystem watcher for the open project.
 *
 * Start on project open, stop on close or replace, and never leave the listener behind: the
 * `listen` promise is caught and its unlisten is called whether it resolved before or after the
 * effect was cleaned up. The batch is returned so the explorer can refresh the directories the
 * change touched, while `onPaths` handles the open buffers.
 */
export function useFileWatch({
	root,
	onPaths,
	onError,
}: {
	root: string | null;
	onPaths: (paths: string[]) => void;
	onError?: (message: string) => void;
}): WatchBatch | null {
	const [batch, setBatch] = useState<WatchBatch | null>(null);
	const token = useRef(0);
	const paths = useRef(onPaths);
	paths.current = onPaths;
	const report = useRef(onError);
	report.current = onError;

	useEffect(() => {
		setBatch(null);
		if (root === null) return;
		let live = true;
		let unlisten: (() => void) | null = null;
		onFsChanged((event) => {
			if (!live) return;
			token.current += 1;
			setBatch({ token: token.current, paths: event.paths });
			paths.current(event.paths);
		})
			.then((off) => {
				if (live) unlisten = off;
				else off();
			})
			.catch((error: unknown) => {
				report.current?.(`file watching unavailable: ${String(error)}`);
			});
		void startWatch(root).catch((error: unknown) => {
			report.current?.(`file watching unavailable: ${String(error)}`);
		});
		return () => {
			live = false;
			unlisten?.();
			unlisten = null;
			void stopWatch().catch(() => {
				/* a stop against no watcher is not a failure worth a notice */
			});
		};
	}, [root]);

	return batch;
}
