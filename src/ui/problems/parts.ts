import type { Diagnostic } from "@/lib/project/api";

const GROUPING_KEY = "quarry.problems.groupByFile";

export function storedGrouping(): boolean {
	try {
		return window.sessionStorage.getItem(GROUPING_KEY) !== "flat";
	} catch {
		return true;
	}
}

export function storeGrouping(grouped: boolean): void {
	try {
		window.sessionStorage.setItem(GROUPING_KEY, grouped ? "file" : "flat");
	} catch {
		// Session storage can be unavailable; the choice still holds for this mount.
	}
}

export const SEVERITY_CLASS: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

export const SEVERITY_LABEL: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "information",
	4: "hint",
};

export function cacheKey(path: string, line: number, character: number): string {
	return `${path}:${line}:${character}`;
}
