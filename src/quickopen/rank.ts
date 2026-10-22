// Pure ranking for quick-open by file name.
// Order, best first:
//   1. exact basename match (case-insensitive)
//   2. basename starts with query (prefix)
//   3. basename contains query (substring)
//   4. full path contains query (substring)
// Ties within a tier: shorter path first, then lexicographic path.
// Empty query returns [] here; the caller supplies recent files instead.

export function basename(path: string): string {
	const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return slash === -1 ? path : path.slice(slash + 1);
}

export function rankFiles(paths: string[], query: string): string[] {
	const q = query.trim().toLowerCase();
	if (q === "") {
		return [];
	}
	const scored = paths.map((path) => {
		const base = basename(path).toLowerCase();
		let tier = 4;
		if (base === q) {
			tier = 0;
		} else if (base.startsWith(q)) {
			tier = 1;
		} else if (base.includes(q)) {
			tier = 2;
		} else if (path.toLowerCase().includes(q)) {
			tier = 3;
		} else {
			tier = 4;
		}
		return { path, tier };
	});
	return scored
		.filter((entry) => entry.tier < 4)
		.sort(
			(a, b) =>
				a.tier - b.tier || a.path.length - b.path.length || a.path.localeCompare(b.path),
		)
		.map((entry) => entry.path);
}
