/**
 * Where the test gutter draws its markers, and what each one runs.
 *
 * The list is the backend's: `list_tests` names every test and the source file it was compiled
 * from. This module only maps those names onto the open file's lines, so the editor never decides
 * what a test is — it matches each name's `fn` leaf inside the `mod` chain the name spells, and
 * reports the module that encloses it as the group a right-click runs.
 */

import { isRustPath } from "@/lib/consts/extensions";
import type { TestItem, TestReport } from "@/lib/project/api";
import { scanTestFile } from "@/lib/tests/scan";

export type MarkerKind = "test" | "group";
export type MarkerState = "idle" | "running" | "passed" | "failed";

export type TestMarker = {
	/** 1-based line the marker sits on. */
	line: number;
	kind: MarkerKind;
	/** Backend test name for a test, module path for a group. */
	name: string;
	/** Backend names this marker's group runs, in file order. */
	group: string[];
	state: MarkerState;
};

export type MarkerInput = {
	/** Absolute path of the open file; null draws nothing. */
	path: string | null;
	text: string;
	items: readonly TestItem[];
	results: ReadonlyMap<string, TestReport>;
	running: ReadonlySet<string>;
};

/** Markers for one file, ascending by line: one per known test, one per enclosing module. */
export function testMarkers(input: MarkerInput): TestMarker[] {
	const { path, text, items, results, running } = input;
	if (path === null || !isRustPath(path) || text === "") return [];
	const { fns, mods } = scanTestFile(text);

	const placed: { marker: TestMarker; mods: string[] }[] = [];
	for (const item of items) {
		if (!belongsToFile(item.binary, path)) continue;
		const segments = item.name.split("::");
		const leaf = segments[segments.length - 1] ?? "";
		const modulePath = segments.slice(0, -1);
		const fn = fns.find((entry) => entry.name === leaf && sameTail(modulePath, entry.mods));
		if (fn === undefined) continue;
		placed.push({
			mods: fn.mods,
			marker: {
				line: fn.line,
				kind: "test",
				name: item.name,
				group: [item.name],
				state: stateOf(item.name, results, running),
			},
		});
	}

	const groups: TestMarker[] = [];
	for (const mod of mods) {
		const under = placed
			.filter((entry) => isWithin(entry.mods, mod.path))
			.sort((left, right) => left.marker.line - right.marker.line);
		if (under.length === 0) continue;
		const names = under.map((entry) => entry.marker.name);
		groups.push({
			line: mod.line,
			kind: "group",
			name: mod.path.join("::"),
			group: names,
			state: groupState(names, results, running),
		});
	}

	// A test's right-click runs the module that encloses it, which is its own group marker.
	const byGroup = new Map(groups.map((group) => [group.name, group.group]));
	for (const entry of placed) {
		const enclosing = byGroup.get(entry.mods.join("::"));
		entry.marker.group = enclosing ?? [entry.marker.name];
	}

	const byLine = new Map<number, TestMarker>();
	for (const marker of [...placed.map((entry) => entry.marker), ...groups]) {
		const existing = byLine.get(marker.line);
		if (existing === undefined || (existing.kind === "group" && marker.kind === "test")) {
			byLine.set(marker.line, marker);
		}
	}
	return [...byLine.values()].sort((left, right) => left.line - right.line);
}

/** The marker state the dock's results already describe. */
export function stateOf(
	name: string,
	results: ReadonlyMap<string, TestReport>,
	running: ReadonlySet<string>,
): MarkerState {
	if (running.has(name)) return "running";
	const report = results.get(name);
	if (report === undefined) return "idle";
	return report.passed ? "passed" : "failed";
}

/** A group runs as one: any live child is running, any failed child fails the group. */
export function groupState(
	names: readonly string[],
	results: ReadonlyMap<string, TestReport>,
	running: ReadonlySet<string>,
): MarkerState {
	if (names.some((name) => running.has(name))) return "running";
	const reports = names.map((name) => results.get(name));
	if (reports.some((report) => report?.passed === false)) return "failed";
	return reports.length > 0 && reports.every((report) => report?.passed === true)
		? "passed"
		: "idle";
}

/** Whether a test compiled from `binary` sits in the file at `path`. */
function belongsToFile(binary: string, path: string): boolean {
	const label = binary.replaceAll("\\", "/");
	// A crate-name fallback names no file; the function match below decides, not this filter.
	if (!label.includes("/") && !/\.[A-Za-z]+$/.test(label)) return true;
	return path === label || path.endsWith(`/${label}`);
}

/**
 * A test name may carry a crate prefix the file's own modules do not spell, so the file's chain has
 * to be the name's tail. An empty chain means the `fn` is top-level, which only a name without a
 * module can be.
 */
function sameTail(name: readonly string[], scanned: readonly string[]): boolean {
	if (scanned.length === 0) return name.length === 0;
	if (scanned.length > name.length) return false;
	const offset = name.length - scanned.length;
	return scanned.every((segment, index) => name[offset + index] === segment);
}

function isWithin(mods: readonly string[], path: readonly string[]): boolean {
	if (path.length > mods.length) return false;
	return path.every((segment, index) => mods[index] === segment);
}
