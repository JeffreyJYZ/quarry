import { type RefObject, useEffect, useRef } from "react";
import { type WatchBatch, dirsToRefresh } from "@/lib/project/watch";

/**
 * Read again every listed directory one external-change batch touched.
 *
 * Only directories already in `loaded` are refreshed, so a change deep inside a subtree the user
 * has not opened never expands it, and the expansion and selection they set up survive. The token
 * guard means one batch is handled exactly once even when a parent hands down a new `refreshDir`.
 */
export function useWatchRefresh(
	watch: WatchBatch | null | undefined,
	loaded: RefObject<Set<string>>,
	refreshDir: (path: string) => void,
): void {
	const handled = useRef(-1);
	useEffect(() => {
		if (watch === null || watch === undefined || watch.token === handled.current) return;
		handled.current = watch.token;
		for (const dir of dirsToRefresh(watch.paths, loaded.current)) refreshDir(dir);
	}, [watch, loaded, refreshDir]);
}
