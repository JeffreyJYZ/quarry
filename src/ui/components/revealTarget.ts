import {
	isUnder,
	joinPath,
	normalizePath,
	relativeTo,
	segments,
	trimTrailingSeparators,
} from "@/lib/project/paths";

/** Strictly below `root`: the root itself is not something to expand. */
export function isInside(root: string, target: string | null): boolean {
	if (target === null) return false;
	if (!isUnder(root, target)) return false;
	const normalizedRoot = trimTrailingSeparators(normalizePath(root));
	const normalizedTarget = trimTrailingSeparators(normalizePath(target));
	return normalizedRoot !== normalizedTarget;
}

export function ancestorDirs(root: string, target: string): string[] {
	const relative = relativeTo(root, target);
	if (relative === null || relative === "") return [];
	const parts = segments(relative);
	if (parts.length <= 1) return [];
	let current = trimTrailingSeparators(root);
	const ancestors: string[] = [];
	for (const part of parts.slice(0, -1)) {
		current = joinPath(current, part);
		ancestors.push(current);
	}
	return ancestors;
}
