/** One set breakpoint's extras, kept per line and sent to the adapter with the plain line list. */
export type BreakpointField = "condition" | "hitCondition" | "logMessage";

export type BreakpointEntry = {
	condition: string | null;
	hitCondition: string | null;
	logMessage: string | null;
	enabled: boolean;
	verified: boolean | null;
	message: string | null;
	temporary: boolean;
};

export type BreakpointRow = {
	key: string;
	path: string;
	line: number;
	verified: boolean | null;
	message: string | null;
	condition: string | null;
	hitCondition: string | null;
	logMessage: string | null;
	enabled: boolean;
	temporary: boolean;
};

/** `path:line`, the identity of one set breakpoint across both the panel and the editor gutter. */
export function breakpointKey(path: string, line: number): string {
	return `${path}:${line}`;
}

/** Rows stay sorted by path then line, so the panel and the gutter agree on order. */
export function sortBreakpoints(rows: readonly BreakpointRow[]): BreakpointRow[] {
	return [...rows].sort((left, right) => {
		if (left.path !== right.path) return left.path < right.path ? -1 : 1;
		return left.line - right.line;
	});
}

/** One bucket per absolute path, each list already in line order. */
export function groupByPath(rows: readonly BreakpointRow[]): Map<string, BreakpointRow[]> {
	const grouped = new Map<string, BreakpointRow[]>();
	for (const row of sortBreakpoints(rows)) {
		const bucket = grouped.get(row.path);
		if (bucket === undefined) {
			grouped.set(row.path, [row]);
		} else {
			bucket.push(row);
		}
	}
	return grouped;
}
