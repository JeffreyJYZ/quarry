// Pure ranking for quick-open by file name + path.
// Matching merges two strategies: a file-name fuzzy/subsequence match and a
// path match. File-name matches always rank above path-only matches.
// Subsequence matching is case-insensitive by default and prefers matches at
// word and path-segment boundaries.

export function splitQuery(query: string): { primary: string; filter: string } {
	const spaceIndex = query.indexOf(" ");
	if (spaceIndex === -1) {
		return { primary: query, filter: "" };
	}
	return { primary: query.slice(0, spaceIndex), filter: query.slice(spaceIndex + 1) };
}

export function basename(path: string): string {
	const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return slash === -1 ? path : path.slice(slash + 1);
}

function isBoundary(text: string, index: number): boolean {
	if (index <= 0) return true;
	const previous = text[index - 1];
	const current = text[index];
	if (
		previous === "/" ||
		previous === "\\" ||
		previous === "." ||
		previous === "-" ||
		previous === "_" ||
		previous === " "
	) {
		return true;
	}
	return /[a-z]/.test(previous) && /[A-Z]/.test(current);
}

// Returns the indices of `needle` matched as a case-insensitive subsequence in
// `haystack`, preferring word/path-segment boundaries. Returns null when no
// subsequence match exists.
export function matchPositions(haystack: string, needle: string): number[] | null {
	const h = haystack.toLowerCase();
	const n = needle.toLowerCase().trim();
	if (n === "") return [];
	let best: number[] | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	const chosen: number[] = [];
	const search = (start: number, needleIndex: number, boundaryCount: number, sumPos: number) => {
		if (needleIndex === n.length) {
			const score = -boundaryCount * 1000 + sumPos;
			if (score < bestScore) {
				bestScore = score;
				best = chosen.slice();
			}
			return;
		}
		for (let i = start; i < h.length; i++) {
			if (h[i] !== n[needleIndex]) continue;
			const boundary = isBoundary(haystack, i) ? 1 : 0;
			chosen.push(i);
			search(i + 1, needleIndex + 1, boundaryCount + boundary, sumPos + i);
			chosen.pop();
		}
	};
	search(0, 0, 0, 0);
	return best;
}

type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export type RankContext = {
	recent?: string[];
	currentPath?: string | null;
};

type Scored = {
	path: string;
	tier: Tier;
	recent: number;
	sameDir: number;
	boundaries: number;
	sumPos: number;
};

export function rankFiles(paths: string[], query: string, context?: RankContext): string[] {
	const q = query.trim().toLowerCase();
	if (q === "") {
		return [];
	}
	const recentSet = new Set(context?.recent ?? []);
	const currentDir =
		context?.currentPath === null || context?.currentPath === undefined
			? null
			: context.currentPath.slice(
					0,
					Math.max(
						context.currentPath.lastIndexOf("/"),
						context.currentPath.lastIndexOf("\\"),
					),
				);
	const scored: Scored[] = [];
	for (const path of paths) {
		const base = basename(path);
		const baseLower = base.toLowerCase();
		const pathLower = path.toLowerCase();
		let tier: Tier | null = null;
		let boundaries = 0;
		let sumPos = 0;
		if (baseLower === q) {
			tier = 0;
		} else if (baseLower.startsWith(q)) {
			tier = 1;
		} else if (baseLower.includes(q)) {
			tier = 2;
		} else {
			const nameMatch = matchPositions(base, q);
			if (nameMatch !== null) {
				tier = 3;
				boundaries = nameMatch.filter((i) => isBoundary(base, i)).length;
				sumPos = nameMatch.reduce((a, b) => a + b, 0);
			} else if (pathLower.includes(q)) {
				tier = 4;
			} else {
				const pathMatch = matchPositions(path, q);
				if (pathMatch !== null) {
					tier = 5;
					boundaries = pathMatch.filter((i) => isBoundary(path, i)).length;
					sumPos = pathMatch.reduce((a, b) => a + b, 0);
				}
			}
		}
		if (tier === null) continue;
		if (tier <= 2) {
			// boundary count for plain substring: count positions of q in base
			const idx = baseLower.indexOf(q);
			if (idx >= 0) {
				boundaries = q.split("").reduce((acc, _ch, offset) => {
					return acc + (isBoundary(base, idx + offset) ? 1 : 0);
				}, 0);
				sumPos = (q.length * idx + (q.length * (q.length - 1)) / 2) | 0;
			}
		}
		const dir = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
		scored.push({
			path,
			tier,
			recent: recentSet.has(path) ? 0 : 1,
			sameDir: currentDir !== null && dir === currentDir ? 0 : 1,
			boundaries,
			sumPos,
		});
	}
	return scored
		.sort(
			(a, b) =>
				a.tier - b.tier ||
				a.recent - b.recent ||
				a.sameDir - b.sameDir ||
				b.boundaries - a.boundaries ||
				a.sumPos - b.sumPos ||
				a.path.length - b.path.length ||
				a.path.localeCompare(b.path),
		)
		.map((entry) => entry.path);
}
