export function removeRecentRoot(roots: readonly string[], target: string): string[] {
	return roots.filter((entry) => entry !== target);
}
