import { liveSessionProfileMismatch } from "@/lib/debug/profile";
import { assembleController } from "./controller";
import { useBreakpointRows, usePinnedKeys } from "./useBreakpointRows";
import type { DebugController } from "./sessionTypes";
import { useBreakpointActions } from "./useBreakpointActions";
import { useBreakpointSync } from "./useBreakpointSync";
import { useDebugEvents } from "./useDebugEvents";
import { useDebugState } from "./useDebugState";
import { useExceptionFilters } from "./useExceptionFilters";
import { useLaunch } from "./useLaunch";
import { usePresets } from "./usePresets";
import { useSessionReset } from "./useSessionReset";
import { useStopSnapshot } from "./useStopSnapshot";
import { useAttach } from "./useAttach";
import { useBuildBinary } from "./useBuildBinary";
import { useTransport } from "./useTransport";
import { useVariables } from "./useVariables";
import { usePins } from "./usePins";
import { useWatchPoints } from "./useWatchPoints";
import type { BuildProfile } from "@/lib/debug/profile";

/**
 * Owns the whole debugger session: presets, the DAP session id, the stop snapshot, the variable
 * expansion cache, breakpoints and data breakpoints. Async work is generation guarded so a second
 * stop or a project switch cannot land stale rows.
 *
 * The state lives in `useDebugState` and the work in the sibling modules; this hook only wires them
 * in dependency order and assembles the controller the panel renders from.
 */
export function useDebugSession(
	root: string | null,
	buildProfile: BuildProfile = "debug",
): DebugController {
	const s = useDebugState(root);

	const { preset, setPreset, presetEntries } = usePresets({
		kind: s.kind,
		presets: s.presets,
		preset: s.preset,
		setPresetState: s.setPreset,
		setResolved: s.setResolved,
		setBuildNeeded: s.setBuildNeeded,
	});

	const { refs, ui } = s;
	const { sessionRef } = refs;
	useSessionReset({
		...ui,
		...refs,
		root,
		setSessionId: s.setSessionId,
		setSessionKind: s.setSessionKind,
		setSessionBuildProfile: s.setSessionBuildProfile,
		setBreakpointMap: s.setBreakpointMap,
		setConfigError: s.setConfigError,
		setPresets: s.setPresets,
		setPresetState: s.setPreset,
		setKind: s.setKind,
		setResolved: s.setResolved,
		setAttachPid: s.setAttachPid,
		setPidInput: s.setPidInput,
		setBuildNeeded: s.setBuildNeeded,
		setBuilding: s.setBuilding,
	});

	const variables = useVariables({
		...refs,
		...ui,
		childrenRef: s.childrenRef,
		expandedRef: s.expandedRef,
	});
	const pins = usePins({
		sessionRef: s.sessionRef,
		stopRef: s.stopRef,
		pinsRef: s.pinsRef,
		setPins: s.setPins,
		setPinResults: s.setPinResults,
		setError: s.setError,
	});
	const watchPoints = useWatchPoints({
		sessionRef: s.sessionRef,
		watchRef: s.watchRef,
		setWatchPoints: s.setWatchPoints,
		setError: s.setError,
	});
	const { commitMap, syncFile, syncAll } = useBreakpointSync({
		...refs,
		setBreakpointMap: s.setBreakpointMap,
		setError: s.setError,
	});
	const breakpointsApi = useBreakpointActions({
		...refs,
		...ui,
		stopRef: s.stopRef,
		commitMap,
		syncFile,
	});
	const exceptions = useExceptionFilters({
		...refs,
		exceptionCheckedRef: s.exceptionCheckedRef,
		setExceptionFilters: s.setExceptionFilters,
		setExceptionChecked: s.setExceptionChecked,
		setError: s.setError,
	});
	const launch = useLaunch({
		...ui,
		...refs,
		rootRef: s.rootRef,
		presetRef: s.presetRef,
		buildProfile,
		buildNeeded: s.buildNeeded,
		building: s.building,
		pidInput: s.pidInput,
		syncAll,
		loadExceptionFilters: exceptions.loadExceptionFilters,
		setBuildNeeded: s.setBuildNeeded,
		setResolved: s.setResolved,
		setSessionId: s.setSessionId,
		setSessionKind: s.setSessionKind,
		setSessionBuildProfile: s.setSessionBuildProfile,
		setAttachPid: s.setAttachPid,
		setPidInput: s.setPidInput,
		setBuilding: s.setBuilding,
		setPresets: s.setPresets,
		setConfigError: s.setConfigError,
	});
	const attach = useAttach({
		...ui,
		rootRef: s.rootRef,
		sessionRef,
		pidInput: s.pidInput,
		syncAll,
		loadExceptionFilters: exceptions.loadExceptionFilters,
		setSessionId: s.setSessionId,
		setSessionKind: s.setSessionKind,
		setAttachPid: s.setAttachPid,
	});
	const buildNow = useBuildBinary({
		rootRef: s.rootRef,
		buildProfile,
		buildNeeded: s.buildNeeded,
		building: s.building,
		launch: launch.launch,
		setError: s.setError,
		setBuilding: s.setBuilding,
		setBuildNeeded: s.setBuildNeeded,
	});
	const transport = useTransport({
		...refs,
		...ui,
		stopRef: s.stopRef,
		watchRef: s.watchRef,
		restarting: s.restarting,
		loadExceptionFilters: exceptions.loadExceptionFilters,
		setSessionId: s.setSessionId,
		setSessionBuildProfile: s.setSessionBuildProfile,
	});
	const handleStop = useStopSnapshot({
		...refs,
		...ui,
		commitMap,
		syncFile,
		loadFrame: variables.loadFrame,
		refreshPins: pins.refreshPins,
	});
	useDebugEvents({
		...refs,
		...ui,
		watchRef: s.watchRef,
		commitMap,
		handleStop,
		setSessionId: s.setSessionId,
		setSessionBuildProfile: s.setSessionBuildProfile,
	});

	const { rows, byPath } = useBreakpointRows(s.breakpointMap);
	return assembleController({
		state: s,
		root,
		profileMismatch: liveSessionProfileMismatch(
			s.sessionBuildProfile,
			buildProfile,
			s.sessionId !== null,
		),
		preset,
		setPreset,
		presetEntries,
		launch: { ...launch, attach, buildNow },
		transport,
		variables,
		pins: { ...pins, ...watchPoints },
		breakpoints: breakpointsApi,
		rows,
		byPath,
		pinnedKeys: usePinnedKeys(s.pins),
		toggleExceptionFilter: exceptions.toggleExceptionFilter,
	});
}
