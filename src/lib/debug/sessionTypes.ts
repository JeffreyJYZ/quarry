import { type BuildProfile } from "@/lib/debug/profile";
import { type Pin, type PinResult } from "@/lib/debug/watch";
import {
	type DapFrame,
	type DapVariable,
	type DapScope,
	type ExceptionFilter,
	type LaunchConfig,
	type LaunchPreset,
} from "@/lib/project/api";

export type DebugStatus = "idle" | "launching" | "running" | "stopped";

export type StepKind = "next" | "stepIn" | "stepOut";

/** Select value of the preset-free Cargo launch; no preset file is expected to define this name. */
export const CARGO_DEFAULT = "cargo:no-preset";

/** The label the Cargo entry carries in the select. */
export const CARGO_LABEL = "Cargo binary (no preset)";

/** The preset-free launch runs like a preset that does not stop on entry. */
export const CARGO_STOP_ON_ENTRY = false;

/** One row of the launch select: the Cargo entry first when the project can resolve one. */
export type PresetEntry = { value: string; label: string };

/**
 * Only the backend's missing-binary rejection earns a build offer. A preset that needs one, an
 * ambiguous workspace or a missing toolchain all say something else and must not trigger a build.
 */
export function asksForBuild(message: string): boolean {
	return message.includes("does not exist yet") && message.includes("build");
}

/** One rendered variable, flattened from the adapter tree so a row can be passed around. */
export type VariableRow = {
	key: string;
	/** Reference of the container the adapter reports this name against. */
	containerRef: number;
	/** Reference of the scope this variable belongs to (for pinning). */
	scopeReference: number;
	/** Ancestor variable names from the scope to this row's parent. */
	path: string[];
	depth: number;
	name: string;
	value: string;
	typeName: string | null;
	variablesReference: number;
	memoryReference: string | null;
};

/** Everything one stop produced: reason, thread, stack and the selected frame's scopes. */
export type StopView = {
	reason: string;
	description: string | null;
	threadId: number | null;
	frames: DapFrame[];
	frameId: number | null;
	scopes: DapScope[];
};

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

export type WatchRow = {
	dataId: string;
	description: string;
};

export type DebugController = {
	status: DebugStatus;
	error: string | null;
	configError: string | null;
	sessionId: string | null;
	/** How the live session started; null with no session. */
	sessionKind: string | null;
	/** Build profile the live session launched with; null with no session. */
	sessionBuildProfile: BuildProfile | null;
	/** Non-null when the build profile changed while a session is live. */
	profileMismatch: string | null;
	/** True while a restart is in flight. */
	restarting: boolean;
	/** True once after a restart, until the next stop clears it. */
	restarted: boolean;
	/** Restart the live session and re-push breakpoints. */
	restart: () => void /** Every row the launch select renders, in order. */;
	/** Project root, for launch-config edits. */
	root: string | null;
	presetEntries: PresetEntry[];
	/** The pid the attach box holds. */
	pidInput: string;
	setPidInput: (value: string) => void;
	/** Attach to a running process; a rejection is one error line. */
	attach: () => void;
	presets: LaunchPreset[];
	preset: string;
	setPreset: (name: string) => void;
	/** Re-read launch.json and replace presets; keeps selection by name. */
	refreshPresets: () => Promise<void>;
	launch: () => void;
	/** The configuration the last launch resolved, for the panel's program line. */
	resolved: LaunchConfig | null;
	/** The missing-binary message; non-null only while one build is still offered. */
	buildNeeded: string | null;
	building: boolean;
	buildNow: () => void;
	continueRun: () => void;
	step: (kind: StepKind) => void;
	stop: () => void;
	stopView: StopView | null;
	selectFrame: (frameId: number) => void;
	/** Expanded children keyed by the `variablesReference` they were fetched for. */
	children: Map<number, DapVariable[]>;
	expanded: Set<string>;
	toggleVariable: (row: VariableRow) => void;
	selectedVariable: VariableRow | null;
	selectVariable: (row: VariableRow) => void;
	/** Write a new value into the debuggee, then refresh the owning scope. */
	setVariable: (row: VariableRow, value: string) => Promise<void>;
	watchPoints: WatchRow[];
	addWatchPoint: (containerRef: number, name: string) => void;
	removeWatchPoint: (dataId: string) => void;
	pins: Pin[];
	pinResults: Map<string, PinResult>;
	pinVariable: (row: VariableRow) => void;
	unpinVariable: (pin: Pin) => void;
	togglePin: (row: VariableRow) => void;
	isPinned: (row: VariableRow) => boolean;
	pinnedKeys: Set<string>;
	exceptionFilters: ExceptionFilter[];
	exceptionChecked: Set<string>;
	toggleExceptionFilter: (filter: string, checked: boolean) => void;
	breakpoints: BreakpointRow[];
	/** The same rows grouped by absolute path, in line order — what a gutter renders. */
	breakpointsByPath: Map<string, BreakpointRow[]>;
	/** Sets one of a breakpoint's extras; empty text clears it. */
	setBreakpointField: (
		path: string,
		line: number,
		field: BreakpointField,
		value: string | null,
	) => void;
	/** Adds or removes one line for one absolute path; safe with no live session. */
	toggleBreakpoint: (path: string, line: number) => void;
	/** Adds the selected frame's line once; the panel's button. */
	addBreakpoint: () => void;
	removeBreakpoint: (path: string, line: number) => void;
	/** Run to cursor: temporary breakpoint on path:line, then continue. */
	runToCursor: (path: string, line: number) => void;
};
