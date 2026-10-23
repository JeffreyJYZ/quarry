import { useRef, useState } from "react";
import type { Pin, PinResult } from "@/lib/debug/watch";
import type {
	DapVariable,
	ExceptionFilter,
	LaunchConfig,
	LaunchPreset,
	ProjectKind,
} from "@/lib/project/api";
import type { BuildProfile } from "@/lib/debug/profile";
import type { BreakpointEntry, StopView, VariableRow, WatchRow } from "./sessionTypes";

/**
 * Every piece of state the debug session keeps, plus the refs its async work reads.
 *
 * The refs are mirrors: an await landing long after the render that started it must see the current
 * value, not the closure's. They are refreshed on every render at the bottom of this hook.
 */
export function useDebugState(root: string | null) {
	const [presets, setPresets] = useState<LaunchPreset[]>([]);
	const [preset, setPreset] = useState("");
	const [configError, setConfigError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [launching, setLaunching] = useState(false);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [stopView, setStopView] = useState<StopView | null>(null);
	const [children, setChildren] = useState<Map<number, DapVariable[]>>(() => new Map());
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [selectedVariable, setSelectedVariable] = useState<VariableRow | null>(null);
	const [watchPoints, setWatchPoints] = useState<WatchRow[]>([]);
	const [pins, setPins] = useState<Pin[]>([]);
	const [pinResults, setPinResults] = useState<Map<string, PinResult>>(() => new Map());
	const [exceptionFilters, setExceptionFilters] = useState<ExceptionFilter[]>([]);
	const [exceptionChecked, setExceptionChecked] = useState<Set<string>>(() => new Set());
	const [breakpointMap, setBreakpointMap] = useState<Map<string, Map<number, BreakpointEntry>>>(
		() => new Map(),
	);
	/** Project kind decides whether the preset-free Cargo entry is offered at all. */
	const [kind, setKind] = useState<ProjectKind | null>(null);
	const [resolved, setResolved] = useState<LaunchConfig | null>(null);
	const [sessionKind, setSessionKind] = useState<string | null>(null);
	const [sessionBuildProfile, setSessionBuildProfile] = useState<BuildProfile | null>(null);
	const [restarting, setRestarting] = useState(false);
	const [restarted, setRestarted] = useState(false);
	const [attachPid, setAttachPid] = useState<number | null>(null);
	const [pidInput, setPidInput] = useState("");
	/** The missing-binary message while one build is still on offer; null once used. */
	const [buildNeeded, setBuildNeeded] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);

	const sessionRef = useRef<string | null>(null);
	const rootRef = useRef<string | null>(root);
	const presetRef = useRef("");
	const stopRef = useRef<StopView | null>(null);
	const watchRef = useRef<WatchRow[]>([]);
	const pinsRef = useRef<Pin[]>(pins);
	const breakpointMapRef = useRef<Map<string, Map<number, BreakpointEntry>>>(breakpointMap);
	const childrenRef = useRef<Map<number, DapVariable[]>>(children);
	const exceptionCheckedRef = useRef<Set<string>>(exceptionChecked);
	const expandedRef = useRef<Set<string>>(expanded);
	const generationRef = useRef(0);

	rootRef.current = root;
	presetRef.current = preset;
	stopRef.current = stopView;
	watchRef.current = watchPoints;
	pinsRef.current = pins;
	breakpointMapRef.current = breakpointMap;
	childrenRef.current = children;
	expandedRef.current = expanded;
	exceptionCheckedRef.current = exceptionChecked;

	const refs = { sessionRef, breakpointMapRef, generationRef };
	const ui = {
		setError,
		setLaunching,
		setRestarting,
		setRestarted,
		setStopView,
		setChildren,
		setExpanded,
		setSelectedVariable,
		setWatchPoints,
		setPins,
		setPinResults,
		setExceptionFilters,
		setExceptionChecked,
	};

	return {
		refs,
		ui,
		presets,
		setPresets,
		preset,
		setPreset,
		configError,
		setConfigError,
		error,
		setError,
		launching,
		setLaunching,
		sessionId,
		setSessionId,
		stopView,
		setStopView,
		children,
		setChildren,
		expanded,
		setExpanded,
		selectedVariable,
		setSelectedVariable,
		watchPoints,
		setWatchPoints,
		pins,
		setPins,
		pinResults,
		setPinResults,
		exceptionFilters,
		setExceptionFilters,
		exceptionChecked,
		setExceptionChecked,
		breakpointMap,
		setBreakpointMap,
		kind,
		setKind,
		resolved,
		setResolved,
		sessionKind,
		setSessionKind,
		sessionBuildProfile,
		setSessionBuildProfile,
		restarting,
		setRestarting,
		restarted,
		setRestarted,
		attachPid,
		setAttachPid,
		pidInput,
		setPidInput,
		buildNeeded,
		setBuildNeeded,
		building,
		setBuilding,
		sessionRef,
		rootRef,
		presetRef,
		stopRef,
		watchRef,
		pinsRef,
		breakpointMapRef,
		childrenRef,
		exceptionCheckedRef,
		expandedRef,
		generationRef,
	};
}

export type DebugState = ReturnType<typeof useDebugState>;
