import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileName } from "@/problems/model";
import {
	type DapFrame,
	type DapScope,
	type DapStoppedEvent,
	type DapVariable,
	dapConfigurationDone,
	dapContinue,
	dapDataBreakpointInfo,
	dapLaunch,
	dapScopes,
	dapSetBreakpoints,
	dapSetDataBreakpoints,
	dapStackTrace,
	dapStep,
	dapStop,
	dapThreads,
	dapVariables,
	type LaunchPreset,
	onDapStopped,
	onDapTerminated,
	readLaunchConfig,
	resolveLaunchConfig,
} from "@/project/api";
import { describeError } from "@/project/errors";

export type DebugStatus = "idle" | "launching" | "running" | "stopped";

export type StepKind = "next" | "stepIn" | "stepOut";

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

export type BreakpointRow = {
	key: string;
	path: string;
	line: number;
	/** `null` until an adapter has confirmed the line. */
	verified: boolean | null;
	message: string | null;
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
	presets: LaunchPreset[];
	preset: string;
	setPreset: (name: string) => void;
	launch: () => void;
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
	watchPoints: WatchRow[];
	addWatchPoint: (containerRef: number, name: string) => void;
	removeWatchPoint: (dataId: string) => void;
	breakpoints: BreakpointRow[];
	/** The same rows grouped by absolute path, in line order — what a gutter renders. */
	breakpointsByPath: Map<string, BreakpointRow[]>;
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
	const [breakpoints, setBreakpoints] = useState<BreakpointRow[]>([]);

	/** Mirrors for async work; the event listeners read these rather than a render closure. */
	const sessionRef = useRef<string | null>(null);
	const rootRef = useRef<string | null>(root);
	const presetRef = useRef("");
	const stopRef = useRef<StopView | null>(null);
	const watchRef = useRef<WatchRow[]>([]);
	const breakpointsRef = useRef<BreakpointRow[]>([]);
	const childrenRef = useRef<Map<number, DapVariable[]>>(children);
	const expandedRef = useRef<Set<string>>(expanded);
	const generationRef = useRef(0);

	rootRef.current = root;
	presetRef.current = preset;
	stopRef.current = stopView;
	watchRef.current = watchPoints;
	breakpointsRef.current = breakpoints;
	childrenRef.current = children;
	expandedRef.current = expanded;

	const setPreset = useCallback((name: string) => setPresetState(name), []);

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
		setBreakpoints([]);
		setError(null);
		setConfigError(null);
		setPresets([]);
		setPresetState("");
		if (previous !== null) {
			void dapStop(previous).catch(() => undefined);
		}
		if (root === null) {
			return;
		}
		let live = true;
		readLaunchConfig(root).then(
			(file) => {
				if (!live) {
					return;
				}
				setPresets(file.configurations);
				setPresetState(file.configurations[0]?.name ?? "");
			},
			(reason) => {
				if (!live) {
					return;
				}
				setConfigError(`Launch config: ${describeError(reason)}`);
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
	const applyBreakpoints = useCallback(async (next: BreakpointRow[]) => {
		const ordered = sortBreakpoints(next);
		breakpointsRef.current = ordered;
		setBreakpoints(ordered);
		const session = sessionRef.current;
		if (session === null) {
			return;
		}
		const byPath = new Map<string, number[]>();
		for (const breakpoint of ordered) {
			const lines = byPath.get(breakpoint.path) ?? [];
			lines.push(breakpoint.line);
			byPath.set(breakpoint.path, lines);
		}
		const verdicts = new Map<string, { verified: boolean; message: string | null }>();
		let failure: string | null = null;
		for (const [path, lines] of byPath) {
			try {
				const results = await dapSetBreakpoints(session, path, lines);
				if (sessionRef.current !== session) {
					return;
				}
				/* The adapter answers one row per requested line, in order, and may resolve it onto a
				 * different line. That moved line is reported, not silently turned into a verified dot. */
				lines.forEach((line, index) => {
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
			} catch (reason) {
				failure = `${fileName(path)}: ${describeError(reason)}`;
			}
		}
		if (verdicts.size > 0) {
			setBreakpoints((current) =>
				current.map((breakpoint) => {
					const verdict = verdicts.get(breakpoint.key);
					return verdict === undefined
						? breakpoint
						: { ...breakpoint, verified: verdict.verified, message: verdict.message };
				}),
			);
		}
		if (failure !== null) {
			setError(`Breakpoints: ${failure}`);
		}
	}, []);

	/** The gutter path: one line of one absolute file, added or removed. */
	const toggleBreakpoint = useCallback(
		(path: string, line: number) => {
			if (path === "" || !Number.isInteger(line) || line < 1) {
				return;
			}
			const key = breakpointKey(path, line);
			const current = breakpointsRef.current;
			setError(null);
			void applyBreakpoints(
				current.some((row) => row.key === key)
					? current.filter((row) => row.key !== key)
					: [...current, { key, path, line, verified: null, message: null }],
			);
		},
		[applyBreakpoints],
	);

	/** Only offered while stopped: the new line comes from the selected frame's source. */
	const addBreakpoint = useCallback(() => {
		const view = stopRef.current;
		const top = view === null ? null : (view.frames[0] ?? null);
		if (view === null || top === null || top.source === null) {
			setError("Stop first: a breakpoint needs a frame source");
			return;
		}
		const key = breakpointKey(top.source, top.line);
		if (breakpointsRef.current.some((breakpoint) => breakpoint.key === key)) {
			return;
		}
		setError(null);
		void applyBreakpoints([
			...breakpointsRef.current,
			{ key, path: top.source, line: top.line, verified: null, message: null },
		]);
	}, [applyBreakpoints]);

	const removeBreakpoint = useCallback(
		(path: string, line: number) => {
			const key = breakpointKey(path, line);
			void applyBreakpoints(breakpointsRef.current.filter((row) => row.key !== key));
		},
		[applyBreakpoints],
	);

	const launch = useCallback(async () => {
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
		let id: string;
		try {
			const config = await resolveLaunchConfig(rootNow, name);
			const session = await dapLaunch(rootNow, config);
			id = session.id;
		} catch (reason) {
			setError(`Launch: ${describeError(reason)}`);
			setLaunching(false);
			return;
		}
		sessionRef.current = id;
		setSessionId(id);
		setLaunching(false);
		/* A fresh adapter knows nothing about rows from an earlier session. */
		if (breakpointsRef.current.length > 0) {
			await applyBreakpoints(breakpointsRef.current);
		}
		try {
			await dapConfigurationDone(id);
		} catch (reason) {
			setError(`Configuration done: ${describeError(reason)}`);
		}
	}, [applyBreakpoints]);

	const continueRun = useCallback(async () => {
		const session = sessionRef.current;
		if (session === null) {
			return;
		}
		try {
			await dapContinue(session);
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
			await dapStep(session, kind);
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

	const breakpointsByPath = useMemo(() => groupByPath(breakpoints), [breakpoints]);

	return {
		status,
		error,
		configError,
		sessionId,
		presets,
		preset,
		setPreset,
		launch: () => {
			void launch();
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
		watchPoints,
		addWatchPoint: (containerRef, name) => {
			void addWatchPoint(containerRef, name);
		},
		removeWatchPoint,
		breakpoints,
		breakpointsByPath,
		toggleBreakpoint,
		addBreakpoint,
		removeBreakpoint,
	};
}
