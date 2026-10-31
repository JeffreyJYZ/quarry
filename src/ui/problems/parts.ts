import type { Diagnostic } from "@/lib/project/api";

const GROUPING_KEY = "quarry.problems.groupByFile";
const ALLOWED_KEY = "quarry.problems.allowed";
const TEXT_FILTER_KEY = "quarry.problems.textFilter";

export function storedGrouping(): boolean {
	try {
		const value = window.localStorage.getItem(GROUPING_KEY);
		if (value === null) return true;
		return value !== "flat";
	} catch {
		return true;
	}
}

export function storeGrouping(grouped: boolean): void {
	try {
		window.localStorage.setItem(GROUPING_KEY, grouped ? "file" : "flat");
	} catch {
		// Storage can be unavailable; the choice still holds for this mount.
	}
}

export function storedAllowed(): Set<number> {
	try {
		const raw = window.localStorage.getItem(ALLOWED_KEY);
		if (raw === null) return new Set([1, 2, 3, 4]);
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set([1, 2, 3, 4]);
		return new Set(parsed.filter((value) => typeof value === "number"));
	} catch {
		return new Set([1, 2, 3, 4]);
	}
}

export function storeAllowed(allowed: ReadonlySet<number>): void {
	try {
		window.localStorage.setItem(ALLOWED_KEY, JSON.stringify([...allowed]));
	} catch {
		// Storage can be unavailable.
	}
}

export function storedTextFilter(): string {
	try {
		return window.localStorage.getItem(TEXT_FILTER_KEY) ?? "";
	} catch {
		return "";
	}
}

export function storeTextFilter(value: string): void {
	try {
		window.localStorage.setItem(TEXT_FILTER_KEY, value);
	} catch {
		// Storage can be unavailable.
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
