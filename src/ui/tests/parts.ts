import type { TestItem, TestReport } from "@/lib/project/api";

export type DockTab = "problems" | "tests" | "run" | "debugger" | "console" | "memory";

/** Every tab in order; a stored value is validated against this list, not a second copy of it. */
export const DOCK_TABS: DockTab[] = ["problems", "tests", "run", "debugger", "console", "memory"];

export function isDockTab(value: unknown): value is DockTab {
	return typeof value === "string" && (DOCK_TABS as string[]).includes(value);
}

/** What the run tab's suffix says: live while a process is up, then how it ended, then nothing. */
export function runTabStatus(input: {
	running: boolean;
	exited: { code: number | null; killed?: boolean } | null;
}): string | null {
	if (input.running) {
		return "running";
	}
	if (input.exited === null) {
		return null;
	}
	if (input.exited.killed === true || input.exited.code === null) {
		return "killed";
	}
	return `exit ${input.exited.code}`;
}

export const OUTPUT_LINE_CAP = 200;
export const RUNNING_GLYPH = "◦";

export type TestGroup = {
	binary: string;
	tests: TestItem[];
};

export function groupByBinary(items: TestItem[]): TestGroup[] {
	const groups: TestGroup[] = [];
	const index = new Map<string, TestGroup>();
	for (const item of items) {
		const existing = index.get(item.binary);
		if (existing !== undefined) {
			existing.tests.push(item);
			continue;
		}
		const group: TestGroup = { binary: item.binary, tests: [item] };
		index.set(item.binary, group);
		groups.push(group);
	}
	return groups;
}

export function splitName(name: string): { module: string; leaf: string } {
	const cut = name.lastIndexOf("::");
	if (cut <= 0) {
		return { module: "", leaf: name };
	}
	return { module: name.slice(0, cut + 2), leaf: name.slice(cut + 2) };
}

export function capOutput(output: string): { text: string; truncated: boolean } {
	const lines = output.split("\n");
	if (lines.length <= OUTPUT_LINE_CAP) {
		return { text: output, truncated: false };
	}
	return { text: lines.slice(0, OUTPUT_LINE_CAP).join("\n"), truncated: true };
}

export function failureReason(output: string): string {
	const lines = output.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "") {
			continue;
		}
		if (/panicked at/i.test(trimmed) || /\berror\b/i.test(trimmed)) {
			return trimmed;
		}
	}
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const trimmed = lines[i].trim();
		if (trimmed !== "") {
			return trimmed;
		}
	}
	return "";
}

export function dotClass(result: TestReport | undefined): string {
	if (result === undefined) {
		return "test-dot";
	}
	return result.passed ? "test-dot pass" : "test-dot fail";
}

export function countByBinary(items: TestItem[]): [string, number][] {
	const counts = new Map<string, number>();
	for (const item of items) {
		counts.set(item.binary, (counts.get(item.binary) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
