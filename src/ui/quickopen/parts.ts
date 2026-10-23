export const STALE_MS = 30_000;
export const RECENT_LIMIT = 30;

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

import { basename } from "@/lib/quickopen/rank";

export function fileParts(path: string, root: string): { name: string; relDir: string } {
	const name = basename(path);
	const dir = path.startsWith(root) ? path.slice(root.length).replace(/^\/+/, "") : path;
	const relDir = dir.slice(0, Math.max(0, dir.length - name.length)).replace(/\/+$/, "");
	return { name, relDir };
}
