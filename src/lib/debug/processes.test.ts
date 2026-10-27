import { describe, expect, test } from "bun:test";
import { filterProcesses, PROCESS_LIMIT, sortProcesses } from "@/lib/debug/processes";
import type { ProcessInfo } from "@/lib/project/api";

const processes: ProcessInfo[] = [
	{ pid: 900, name: "WindowServer" },
	{ pid: 12, name: "brave" },
	{ pid: 431, name: "Brave Browser" },
	{ pid: 77, name: "zsh" },
];

describe("sortProcesses", () => {
	test("sorts by name and leaves the input alone", () => {
		const sorted = sortProcesses(processes);
		expect(sorted.map((process) => process.name)).toEqual([
			"brave",
			"Brave Browser",
			"WindowServer",
			"zsh",
		]);
		expect(processes[0].pid).toBe(900);
	});

	test("ties on name fall back to pid", () => {
		const sorted = sortProcesses([
			{ pid: 20, name: "node" },
			{ pid: 3, name: "node" },
		]);
		expect(sorted.map((process) => process.pid)).toEqual([3, 20]);
	});
});

describe("filterProcesses", () => {
	test("empty query returns every process, name-sorted", () => {
		const visible = filterProcesses(processes, "");
		expect(visible.length).toBe(4);
		expect(visible[0].name).toBe("brave");
	});

	test("matches names case-insensitively", () => {
		const visible = filterProcesses(processes, "BRAVE");
		expect(visible.map((process) => process.pid)).toEqual([12, 431]);
	});

	test("matches on pid digits", () => {
		const visible = filterProcesses(processes, "43");
		expect(visible.map((process) => process.pid)).toEqual([431]);
	});

	test("whitespace-only query behaves like empty", () => {
		expect(filterProcesses(processes, "   ").length).toBe(4);
	});

	test("no match returns nothing", () => {
		expect(filterProcesses(processes, "nope")).toEqual([]);
	});

	test("caps the visible rows", () => {
		const many = Array.from({ length: PROCESS_LIMIT + 20 }, (_, index) => ({
			pid: index + 1,
			name: `proc-${String(index).padStart(3, "0")}`,
		}));
		expect(filterProcesses(many, "").length).toBe(PROCESS_LIMIT);
		expect(filterProcesses(many, "", 5).length).toBe(5);
	});
});
