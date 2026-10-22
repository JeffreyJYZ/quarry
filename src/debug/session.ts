import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dapContinueOn, dapStepOn } from "@/debug/dap";
import { fileName } from "@/problems/model";
import {
	buildProject,
	type DapBreakpoint,
	type DapFrame,
	type DapScope,
	type DapStoppedEvent,
	type DapVariable,
	dapAttach,
	dapConfigurationDone,
	dapDataBreakpointInfo,
	dapLaunch,
	dapScopes,
	dapSetBreakpoints,
	dapSetBreakpointsEx,
	dapSetDataBreakpoints,
	dapSetVariable,
	dapStackTrace,
	dapStop,
	dapThreads,
	dapVariables,
	defaultLaunchConfig,
	type LaunchConfig,
	type LaunchPreset,
	onDapStopped,
	onDapTerminated,
	openProject,
	type ProjectKind,
	readLaunchConfig,
	resolveLaunchConfig,
} from "@/project/api";
import { describeError } from "@/project/errors";

export type DebugStatus = "idle" | "launching" | "running" | "stopped";

export type StepKind = "next" | "stepIn" | "stepOut";

/** Select value of the preset-free Cargo launch; no preset file is expected to define this name. */
const CARGO_DEFAULT = "cargo:no-preset";

/** The label the Cargo entry carries in the select. */
const CARGO_LABEL = "Cargo binary (no preset)";

/** The preset-free launch runs like a preset that does not stop on entry. */
const CARGO_STOP_ON_ENTRY = false;

/** One row of the launch select: the Cargo entry first when the project can resolve one. */
export type PresetEntry = { value: string; label: string };

/**
 * Only the backend's missing-binary rejection earns a build offer. A preset that needs one, an
 * ambiguous workspace or a missing toolchain all say something else and must not trigger a build.
 */
function asksForBuild(message: string): boolean {
	return message.includes("does not exist yet") && message.includes("build");
}

/** One rendered variable, flattened from the adapter tree so a row can be passed around. */
export type VariableRow = {
	key: string;
	/** Reference of the container the adapter reports this name against. */
	containerRef: number;
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
};

/** `path:line`, the identity of one set breakpoint across both the panel and the editor gutter. */
export function breakpointKey(path: string, line: number): string {
	return `${path}:${line}`;
}

/** Rows stay sorted by path then line, so the panel and the gutter agree on order. */
function sortBreakpoints(rows: readonly BreakpointRow[]): BreakpointRow[] {
	return [...rows].sort((left, right) => {
		if (left.path !== right.path) return left.path < right.path ? -1 : 1;
		return left.line - right.line;
	});
}

/** One bucket per absolute path, each list already in line order. */
function groupByPath(rows: readonly BreakpointRow[]): Map<string, BreakpointRow[]> {
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
	/** Every row the launch select renders, in order. */
	presetEntries: PresetEntry[];
	/** The pid the attach box holds. */
	pidInput: string;
	setPidInput: (value: string) => void;
	/** Attach to a running process; a rejection is one error line. */
	attach: () => void;
	presets: LaunchPreset[];
	preset: string;
	setPreset: (name: string) => void;
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
};

/**
 * Owns the whole debugger session: presets, the DAP session id, the stop snapshot, the variable
 * expansion cache, breakpoints and data breakpoints. Async work is generation guarded so a second
 * stop or a project switch cannot land stale rows.
 */
export function useDebugSession(root: string | null): DebugController {
	const [presets, setPresets] = useState<LaunchPreset[]>([]);
	const [preset, setPresetState] = useState("");
	const [configError, setConfigError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [launching, setLaunching] = useState(false);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [stopView, setStopView] = useState<StopView | null>(null);
	const [children, setChildren] = useState<Map<number, DapVariable[]>>(() => new Map());
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [selectedVariable, setSelectedVariable] = useState<VariableRow | null>(null);
	const [watchPoints, setWatchPoints] = useState<WatchRow[]>([]);
	const [breakpointMap, setBreakpointMap] = useState<Map<string, Map<number, BreakpointEntry>>>(
		() => new Map(),
	);
	/** Project kind decides whether the preset-free Cargo entry is offered at all. */
	const [kind, setKind] = useState<ProjectKind | null>(null);
	/** The configuration the last launch resolved, shown under the select. */
	const [resolved, setResolved] = useState<LaunchConfig | null>(null);
	const [sessionKind, setSessionKind] = useState<string | null>(null);
	const [attachPid, setAttachPid] = useState<number | null>(null);
	const [pidInput, setPidInputState] = useState("");
	/** The missing-binary message while one build is still on offer; null once used. */
	const [buildNeeded, setBuildNeeded] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);

	/** Mirrors for async work; the event listeners read these rather than a render closure. */
	const sessionRef = useRef<string | null>(null);
	const rootRef = useRef<string | null>(root);
	const presetRef = useRef("");
	const stopRef = useRef<StopView | null>(null);
	const watchRef = useRef<WatchRow[]>([]);
	const breakpointMapRef = useRef<Map<string, Map<number, BreakpointEntry>>>(breakpointMap);
	const childrenRef = useRef<Map<number, DapVariable[]>>(children);
	const expandedRef = useRef<Set<string>>(expanded);
	const generationRef = useRef(0);

	rootRef.current = root;
	presetRef.current = preset;
	stopRef.current = stopView;
	watchRef.current = watchPoints;
	breakpointMapRef.current = breakpointMap;
	childrenRef.current = children;
	expandedRef.current = expanded;

	/* A new selection invalidates the resolved path shown under the select. */
	const setPreset = useCallback((name: string) => {
		setResolved(null);
		setBuildNeeded(null);
		setPresetState(name);
	}, []);

	/** The select's rows: a Cargo project's preset-free launch first, then whatever the file defines. */
	const presetEntries = useMemo(() => {
		const entries: PresetEntry[] = [];
		if (kind === "cargo") {
			entries.push({ value: CARGO_DEFAULT, label: CARGO_LABEL });
		}
		for (const entry of presets) {
			entries.push({ value: entry.name, label: entry.name });
		}
		return entries;
	}, [kind, presets]);

	/**
	 * Keep the selection on a rendered row. A file's own preset wins when there is one; a Cargo
	 * project with no presets lands on the preset-free entry.
	 */
	useEffect(() => {
		const values = presetEntries.map((entry) => entry.value);
		setPresetState((current) => {
			if (values.includes(current)) {
				return current;
			}
			return presets[0]?.name ?? values[0] ?? "";
		});
	}, [presetEntries, presets]);

	/** Reset on every project switch; a live session from the previous root is stopped. */
	useEffect(() => {
		generationRef.current += 1;
		const previous = sessionRef.current;
		sessionRef.current = null;
		setSessionId(null);
		setLaunching(false);
		setStopView(null);
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
		setWatchPoints([]);
		setBreakpointMap(new Map());
		setError(null);
		setConfigError(null);
		setPresets([]);
		setPresetState("");
		setKind(null);
		setResolved(null);
		setSessionKind(null);
		setAttachPid(null);
		setPidInputState("");
		setBuildNeeded(null);
		setBuilding(false);
		if (previous !== null) {
			void dapStop(previous).catch(() => undefined);
		}
		if (root === null) {
			return;
		}
		let live = true;
		/* Kind and presets are independent reads; the select's rows need both, so each lands alone. */
		openProject(root).then(
			(info) => {
				if (live) {
					setKind(info.kind);
				}
			},
			(reason) => {
				if (live) {
					setConfigError((current) => current ?? `Project: ${describeError(reason)}`);
				}
			},
		);
		readLaunchConfig(root).then(
			(file) => {
				if (live) {
					setPresets(file.configurations);
				}
			},
			(reason) => {
				if (live) {
					setConfigError(`Launch config: ${describeError(reason)}`);
				}
			},
		);
		return () => {
			live = false;
		};
	}, [root]);

	/** Load one frame's scopes and their top-level variables; nested rows load on demand. */
	const loadFrame = useCallback(async (session: string, frameId: number) => {
		const generation = ++generationRef.current;
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
		let failure: string | null = null;
		try {
			const scopes = await dapScopes(session, frameId);
			if (generation !== generationRef.current) {
				return;
			}
			setStopView((current) => (current === null ? current : { ...current, scopes }));
			const lists = await Promise.all(
				scopes.map(async (scope) => {
					try {
						const value = await dapVariables(session, scope.variablesReference);
						return { scope, value };
					} catch (reason) {
						failure = `${scope.name}: ${describeError(reason)}`;
						return { scope, value: null };
					}
				}),
			);
			if (generation !== generationRef.current) {
				return;
			}
			const next = new Map<number, DapVariable[]>();
			for (const entry of lists) {
				if (entry.value !== null) {
					next.set(entry.scope.variablesReference, entry.value);
				}
			}
			childrenRef.current = next;
			setChildren(next);
		} catch (reason) {
			if (generation === generationRef.current) {
				setError(`Scopes: ${describeError(reason)}`);
			}
		}
		if (failure !== null) {
			setError(`Variables: ${failure}`);
		}
	}, []);

	const handleStop = useCallback(
		async (event: DapStoppedEvent) => {
			if (sessionRef.current === null || event.session !== sessionRef.current) {
				return;
			}
			const session = event.session;
			setLaunching(false);
			setError(null);
			const generation = ++generationRef.current;
			setStopView({
				reason: event.reason,
				description: event.description,
				threadId: event.threadId,
				frames: [],
				frameId: null,
				scopes: [],
			});
			setChildren(new Map());
			setExpanded(new Set());
			setSelectedVariable(null);
			try {
				const threads = await dapThreads(session);
				if (generation !== generationRef.current) {
					return;
				}
				const threadId = event.threadId ?? threads[0]?.id ?? null;
				if (threadId === null) {
					setError("Stopped with no thread to inspect");
					return;
				}
				const frames = await dapStackTrace(session, threadId);
				if (generation !== generationRef.current) {
					return;
				}
				const top = frames[0] ?? null;
				setStopView((current) =>
					current === null
						? current
						: { ...current, threadId, frames, frameId: top === null ? null : top.id },
				);
				if (top === null) {
					return;
				}
				await loadFrame(session, top.id);
			} catch (reason) {
				if (generation === generationRef.current) {
					setError(`Stack: ${describeError(reason)}`);
				}
			}
		},
		[loadFrame],
	);

	const selectFrame = useCallback(
		(frameId: number) => {
			const session = sessionRef.current;
			if (session === null) {
				return;
			}
			setStopView((current) => (current === null ? current : { ...current, frameId }));
			void loadFrame(session, frameId);
		},
		[loadFrame],
	);

	const toggleVariable = useCallback((row: VariableRow) => {
		const reference = row.variablesReference;
		if (expandedRef.current.has(row.key)) {
			/* Descendant keys go too, or a re-expanded row would render stale grandchildren. */
			const nextExpanded = new Set<string>();
			for (const key of expandedRef.current) {
				if (key !== row.key && !key.startsWith(`${row.key}/`)) {
					nextExpanded.add(key);
				}
			}
			expandedRef.current = nextExpanded;
			setExpanded(nextExpanded);
			const nextChildren = new Map(childrenRef.current);
			nextChildren.delete(reference);
			childrenRef.current = nextChildren;
			setChildren(nextChildren);
			return;
		}
		if (reference === 0) {
			return;
		}
		const session = sessionRef.current;
		const nextExpanded = new Set(expandedRef.current);
		nextExpanded.add(row.key);
		expandedRef.current = nextExpanded;
		setExpanded(nextExpanded);
		if (session === null || childrenRef.current.has(reference)) {
			return;
		}
		void dapVariables(session, reference).then(
			(values) => {
				const nextChildren = new Map(childrenRef.current).set(reference, values);
				childrenRef.current = nextChildren;
				setChildren(nextChildren);
			},
			(reason) => setError(`Variables: ${describeError(reason)}`),
		);
	}, []);

	const selectVariable = useCallback((row: VariableRow) => {
		setSelectedVariable((current) =>
			current !== null && current.key === row.key ? null : row,
		);
	}, []);

	const setVariable = useCallback(async (row: VariableRow, value: string) => {
		const session = sessionRef.current;
		if (session === null) {
			setError("Set variable needs a live debug session");
			throw new Error("no session");
		}
		await dapSetVariable(session, row.containerRef, row.name, value);
		try {
			const values = await dapVariables(session, row.containerRef);
			if (sessionRef.current !== session) return;
			const next = new Map(childrenRef.current);
			next.set(row.containerRef, values);
			childrenRef.current = next;
			setChildren(next);
		} catch (reason) {
			if (sessionRef.current === session) {
				setError(`Variables: ${describeError(reason)}`);
			}
		}
		if (row.variablesReference > 0 && expandedRef.current.has(row.key)) {
			try {
				const values = await dapVariables(session, row.variablesReference);
				if (sessionRef.current !== session) return;
				const next = new Map(childrenRef.current);
				next.set(row.variablesReference, values);
				childrenRef.current = next;
				setChildren(next);
			} catch (reason) {
				if (sessionRef.current === session) {
					setError(`Variables: ${describeError(reason)}`);
				}
			}
		}
	}, []);

	const addWatchPoint = useCallback(async (containerRef: number, name: string) => {
		const session = sessionRef.current;
		if (session === null) {
			setError("Watch points need a live debug session");
			return;
		}
		try {
			const info = await dapDataBreakpointInfo(session, containerRef, name);
			if (sessionRef.current !== session) {
				return;
			}
			if (info.dataId === null) {
				setError(`Cannot watch ${name}: ${info.description || "no data id"}`);
				return;
			}
			const current = watchRef.current;
			if (current.some((watch) => watch.dataId === info.dataId)) {
				return;
			}
			const next = [
				...current,
				{ dataId: info.dataId, description: info.description || name },
			];
			watchRef.current = next;
			setWatchPoints(next);
			setError(null);
			await dapSetDataBreakpoints(
				session,
				next.map((watch) => watch.dataId),
			);
		} catch (reason) {
			setError(`Watch: ${describeError(reason)}`);
		}
	}, []);

	const removeWatchPoint = useCallback((dataId: string) => {
		const next = watchRef.current.filter((watch) => watch.dataId !== dataId);
		watchRef.current = next;
		setWatchPoints(next);
		const session = sessionRef.current;
		if (session === null) {
			return;
		}
		void dapSetDataBreakpoints(
			session,
			next.map((watch) => watch.dataId),
		).then(
			() => undefined,
			(reason) => setError(`Watch: ${describeError(reason)}`),
		);
	}, []);

	/**
	 * Commit one breakpoint set, then fold the adapter's verdicts back onto the matching lines.
	 * With no live session the set is only recorded: a launch re-sends everything.
	 */
	const commitMap = useCallback((next: Map<string, Map<number, BreakpointEntry>>) => {
		breakpointMapRef.current = next;
		setBreakpointMap(next);
	}, []);

	const syncFile = useCallback(
		async (path: string) => {
			const session = sessionRef.current;
			const lines = breakpointMapRef.current.get(path);
			if (session === null) {
				return;
			}
			const rows = [...(lines ?? new Map<number, BreakpointEntry>()).entries()].sort(
				(left, right) => left[0] - right[0],
			);
			const plain = rows.every(
				([, entry]) =>
					entry.enabled &&
					entry.condition === null &&
					entry.hitCondition === null &&
					entry.logMessage === null,
			);
			let results: DapBreakpoint[];
			try {
				results = plain
					? await dapSetBreakpoints(
							session,
							path,
							rows.map(([line]) => line),
						)
					: await dapSetBreakpointsEx(
							session,
							path,
							rows
								.filter(([, entry]) => entry.enabled)
								.map(([line, entry]) => ({
									line,
									condition: entry.condition,
									hitCondition: entry.hitCondition,
									logMessage: entry.logMessage,
									enabled: true,
								})),
						);
			} catch (reason) {
				setError(`Breakpoints: ${fileName(path)}: ${describeError(reason)}`);
				return;
			}
			if (sessionRef.current !== session) {
				return;
			}
			const verdicts = new Map<string, { verified: boolean; message: string | null }>();
			if (plain || results.length === rows.length) {
				rows.forEach(([line], index) => {
					const result = results[index];
					if (result === undefined) {
						verdicts.set(breakpointKey(path, line), {
							verified: false,
							message: "adapter reported no breakpoint",
						});
						return;
					}
					const moved = result.line !== null && result.line !== line;
					verdicts.set(breakpointKey(path, line), {
						verified: result.verified,
						message: result.message ?? (moved ? `moved to line ${result.line}` : null),
					});
				});
			} else {
				for (const [line] of rows) {
					const result = results.find((candidate) => candidate.line === line);
					verdicts.set(breakpointKey(path, line), {
						verified: result?.verified ?? false,
						message: result?.message ?? null,
					});
				}
			}
			if (verdicts.size > 0) {
				const next = new Map(breakpointMapRef.current);
				const lines = new Map(next.get(path) ?? []);
				for (const [line] of rows) {
					const entry = lines.get(line);
					const verdict = verdicts.get(breakpointKey(path, line));
					if (entry === undefined || verdict === undefined) continue;
					lines.set(line, {
						...entry,
						verified: verdict.verified,
						message: verdict.message,
					});
				}
				next.set(path, lines);
				commitMap(next);
			}
		},
		[commitMap],
	);

	const syncAll = useCallback(async () => {
		for (const path of [...breakpointMapRef.current.keys()]) {
			await syncFile(path);
		}
	}, [syncFile]);

	/** The gutter path: one line of one absolute file, added or removed. */
	const toggleBreakpoint = useCallback(
		(path: string, line: number) => {
			if (path === "" || !Number.isInteger(line) || line < 1) {
				return;
			}
			setError(null);
			const current = breakpointMapRef.current;
			const lines = current.get(path);
			const exists = lines?.has(line);
			if (exists) {
				const next = new Map(current);
				const nextLines = new Map(lines ?? []);
				nextLines.delete(line);
				if (nextLines.size === 0) next.delete(path);
				else next.set(path, nextLines);
				commitMap(next);
			} else {
				const next = new Map(current);
				const nextLines = new Map(lines ?? []);
				nextLines.set(line, {
					condition: null,
					hitCondition: null,
					logMessage: null,
					enabled: true,
					verified: null,
					message: null,
				});
				next.set(path, nextLines);
				commitMap(next);
			}
			void syncFile(path);
		},
		[commitMap, syncFile],
	);

	/** Only offered while stopped: the new line comes from the selected frame's source. */
	const addBreakpoint = useCallback(() => {
		const view = stopRef.current;
		const top = view === null ? null : (view.frames[0] ?? null);
		if (view === null || top === null || top.source === null) {
			setError("Stop first: a breakpoint needs a frame source");
			return;
		}
		const path = top.source;
		const line = top.line;
		const lines = breakpointMapRef.current.get(path);
		if (lines?.has(line)) {
			return;
		}
		setError(null);
		const next = new Map(breakpointMapRef.current);
		const nextLines = new Map(lines ?? []);
		nextLines.set(line, {
			condition: null,
			hitCondition: null,
			logMessage: null,
			enabled: true,
			verified: null,
			message: null,
		});
		next.set(path, nextLines);
		commitMap(next);
		void syncFile(path);
	}, [commitMap, syncFile]);

	const removeBreakpoint = useCallback(
		(path: string, line: number) => {
			const lines = breakpointMapRef.current.get(path);
			if (lines === undefined || !lines.has(line)) return;
			const next = new Map(breakpointMapRef.current);
			const nextLines = new Map(lines);
			nextLines.delete(line);
			if (nextLines.size === 0) next.delete(path);
			else next.set(path, nextLines);
			commitMap(next);
			void syncFile(path);
		},
		[commitMap, syncFile],
	);

	const setBreakpointField = useCallback(
		(path: string, line: number, field: BreakpointField, value: string | null) => {
			const lines = breakpointMapRef.current.get(path);
			const entry = lines?.get(line);
			if (entry === undefined) return;
			const next = new Map(breakpointMapRef.current);
			const nextLines = new Map(lines ?? []);
			nextLines.set(line, { ...entry, [field]: value, verified: null, message: null });
			next.set(path, nextLines);
			commitMap(next);
			void syncFile(path);
		},
		[commitMap, syncFile],
	);

	/** The one place a select value becomes a configuration; a preset and the Cargo default differ only here. */
	const resolveConfig = useCallback(async (root: string, name: string) => {
		if (name === CARGO_DEFAULT) {
			return defaultLaunchConfig(root, CARGO_STOP_ON_ENTRY);
		}
		return resolveLaunchConfig(root, name);
	}, []);

	/**
	 * Launch the selected configuration. A missing binary offers one build; every other rejection
	 * is a plain error line.
	 */
	const launch = useCallback(
		async (offerBuild = true) => {
			const rootNow = rootRef.current;
			if (rootNow === null) {
				setError("Open a project first");
				return;
			}
			const name = presetRef.current;
			if (name === "") {
				setError("No launch preset in .quarry/launch.json");
				return;
			}
			if (sessionRef.current !== null) {
				setError("A debug session is already running");
				return;
			}
			setLaunching(true);
			setError(null);
			setStopView(null);
			let config: LaunchConfig;
			try {
				config = await resolveConfig(rootNow, name);
			} catch (reason) {
				const message = describeError(reason);
				setLaunching(false);
				if (offerBuild && asksForBuild(message)) {
					setBuildNeeded(message);
					setError(message);
					return;
				}
				setError(`Launch: ${message}`);
				return;
			}
			setResolved(config);
			let id: string;
			try {
				const session = await dapLaunch(rootNow, config);
				id = session.id;
			} catch (reason) {
				setError(`Launch: ${describeError(reason)}`);
				setLaunching(false);
				return;
			}
			sessionRef.current = id;
			setSessionId(id);
			setSessionKind("launch");
			setLaunching(false);
			/* A fresh adapter knows nothing about rows from an earlier session. */
			await syncAll();
			try {
				await dapConfigurationDone(id);
			} catch (reason) {
				setError(`Configuration done: ${describeError(reason)}`);
			}
		},
		[syncAll, resolveConfig],
	);

	/** Build the project, then retry the launch once; a second failure is a plain error line. */
	const buildNow = useCallback(async () => {
		const rootNow = rootRef.current;
		const message = buildNeeded;
		if (rootNow === null || building || message === null) {
			return;
		}
		setBuilding(true);
		setBuildNeeded(null);
		setError(null);
		try {
			const report = await buildProject(rootNow, "debug");
			if (!report.success) {
				setError(`Build: ${report.summary}`);
				/* The offer stays: only the launch retry is limited to one. */
				setBuildNeeded(message);
				return;
			}
		} catch (reason) {
			setError(`Build: ${describeError(reason)}`);
			setBuildNeeded(message);
			return;
		} finally {
			setBuilding(false);
		}
		await launch(false);
	}, [buildNeeded, building, launch]);

	const setPidInput = useCallback((value: string) => {
		setPidInputState(value);
	}, []);

	const attach = useCallback(async () => {
		const rootNow = rootRef.current;
		if (rootNow === null) {
			setError("Open a project first");
			return;
		}
		if (sessionRef.current !== null) {
			setError("A debug session is already running");
			return;
		}
		const pid = Number(pidInput.trim());
		if (!Number.isInteger(pid) || pid <= 0) {
			setError("Attach: invalid pid");
			return;
		}
		setLaunching(true);
		setError(null);
		setStopView(null);
		let session: { id: string; program: string };
		try {
			session = await dapAttach(pid);
		} catch (reason) {
			setError(`Attach: ${describeError(reason)}`);
			setLaunching(false);
			return;
		}
		const id = session.id;
		sessionRef.current = id;
		setSessionId(id);
		setSessionKind("attach");
		setAttachPid(pid);
		setLaunching(false);
		await syncAll();
		try {
			await dapConfigurationDone(id);
		} catch (reason) {
			setError(`Configuration done: ${describeError(reason)}`);
		}
	}, [pidInput, syncAll]);

	const continueRun = useCallback(async () => {
		const session = sessionRef.current;
		if (session === null) {
			return;
		}
		try {
			await dapContinueOn(session, stopRef.current?.threadId ?? undefined);
			setStopView(null);
			setError(null);
		} catch (reason) {
			setError(`Continue: ${describeError(reason)}`);
		}
	}, []);

	const step = useCallback(async (kind: StepKind) => {
		const session = sessionRef.current;
		if (session === null) {
			return;
		}
		try {
			await dapStepOn(session, kind, stopRef.current?.threadId ?? undefined);
			setStopView(null);
			setError(null);
		} catch (reason) {
			setError(`Step: ${describeError(reason)}`);
		}
	}, []);

	const stop = useCallback(async () => {
		const session = sessionRef.current;
		if (session === null) {
			return;
		}
		try {
			await dapStop(session);
			setError(null);
		} catch (reason) {
			setError(`Stop: ${describeError(reason)}`);
		}
		generationRef.current += 1;
		sessionRef.current = null;
		setSessionId(null);
		setLaunching(false);
		setStopView(null);
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
		watchRef.current = [];
		setWatchPoints([]);
	}, []);

	const handleTerminated = useCallback((session: string) => {
		if (sessionRef.current !== null && session !== sessionRef.current) {
			return;
		}
		generationRef.current += 1;
		sessionRef.current = null;
		setSessionId(null);
		setLaunching(false);
		setStopView(null);
		setChildren(new Map());
		setExpanded(new Set());
		setSelectedVariable(null);
		watchRef.current = [];
		setWatchPoints([]);
	}, []);

	const stopHandler = useRef(handleStop);
	stopHandler.current = handleStop;
	const terminatedHandler = useRef(handleTerminated);
	terminatedHandler.current = handleTerminated;

	/** One subscription each for the app's lifetime; handlers read the live refs. */
	useEffect(() => {
		let live = true;
		let offStopped: (() => void) | null = null;
		let offTerminated: (() => void) | null = null;
		onDapStopped((event) => {
			void stopHandler.current(event);
		}).then(
			(unlisten) => {
				if (live) {
					offStopped = unlisten;
				} else {
					unlisten();
				}
			},
			(reason) => {
				if (live) {
					setError(`Debug events: ${describeError(reason)}`);
				}
			},
		);
		onDapTerminated((session) => terminatedHandler.current(session)).then(
			(unlisten) => {
				if (live) {
					offTerminated = unlisten;
				} else {
					unlisten();
				}
			},
			(reason) => {
				if (live) {
					setError(`Debug events: ${describeError(reason)}`);
				}
			},
		);
		return () => {
			live = false;
			offStopped?.();
			offTerminated?.();
		};
	}, []);

	const status: DebugStatus = launching
		? "launching"
		: sessionId === null
			? "idle"
			: stopView === null
				? "running"
				: "stopped";

	const breakpoints = useMemo(() => {
		const rows: BreakpointRow[] = [];
		for (const [path, lines] of breakpointMap) {
			for (const [line, entry] of lines) {
				rows.push({
					key: breakpointKey(path, line),
					path,
					line,
					verified: entry.verified,
					message: entry.message,
					condition: entry.condition,
					hitCondition: entry.hitCondition,
					logMessage: entry.logMessage,
					enabled: entry.enabled,
				});
			}
		}
		return sortBreakpoints(rows);
	}, [breakpointMap]);

	const breakpointsByPath = useMemo(() => groupByPath(breakpoints), [breakpoints]);
	void attachPid;

	return {
		status,
		error,
		configError,
		sessionId,
		sessionKind,
		pidInput,
		setPidInput,
		attach: () => {
			void attach();
		},
		presetEntries,
		presets,
		preset,
		setPreset,
		launch: () => {
			void launch();
		},
		resolved,
		buildNeeded,
		building,
		buildNow: () => {
			void buildNow();
		},
		continueRun: () => {
			void continueRun();
		},
		step: (kind) => {
			void step(kind);
		},
		stop: () => {
			void stop();
		},
		stopView,
		selectFrame,
		children,
		expanded,
		toggleVariable,
		selectedVariable,
		selectVariable,
		setVariable,
		watchPoints,
		addWatchPoint: (containerRef, name) => {
			void addWatchPoint(containerRef, name);
		},
		removeWatchPoint,
		breakpoints,
		breakpointsByPath,
		setBreakpointField,
		toggleBreakpoint,
		addBreakpoint,
		removeBreakpoint,
	};
}
