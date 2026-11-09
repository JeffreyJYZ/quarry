export { RECENT_LIMIT, STALE_MS } from "@/lib/consts/quickopen";

export type CacheEntry = { files: string[]; fetchedAt: number };

export const cache = new Map<string, CacheEntry>();
export const recent: string[] = [];

export function recordRecent(path: string): void {
	const index = recent.indexOf(path);
	if (index !== -1) {
		recent.splice(index, 1);
	}
	recent.unshift(path);
	if (recent.length > 200) {
		recent.length = 200;
	}
}

import { directoryOf, fileName, relativeTo } from "@/lib/project/paths";

export function fileParts(path: string, root: string): { name: string; relDir: string } {
	const relative = relativeTo(root, path);
	const dir = relative === null ? directoryOf(path) : directoryOf(relative);
	return { name: fileName(path), relDir: dir };
}
