import type { DebugState } from "./useDebugState";
import type { DebugController } from "./sessionTypes";

type LaunchApi = {
	launch: (offerBuild?: boolean, programOverride?: string | null) => Promise<void>;
	buildNow: () => Promise<void>;
	attach: () => Promise<void>;
	refreshPresets: () => Promise<void>;
};

type TransportApi = {
	continueRun: () => Promise<void>;
	step: (kind: Parameters<DebugController["step"]>[0]) => Promise<void>;
	stop: () => Promise<void>;
	restart: () => Promise<void>;
};

type VariableApi = {
	selectFrame: DebugController["selectFrame"];
	toggleVariable: DebugController["toggleVariable"];
	selectVariable: DebugController["selectVariable"];
	setVariable: DebugController["setVariable"];
};

type PinApi = {
	addWatchPoint: (containerRef: number, name: string) => Promise<void>;
	removeWatchPoint: (dataId: string) => void;
	pinVariable: DebugController["pinVariable"];
	unpinVariable: DebugController["unpinVariable"];
	togglePin: DebugController["togglePin"];
	isPinned: DebugController["isPinned"];
};

type BreakpointApi = {
	setBreakpointField: DebugController["setBreakpointField"];
	toggleBreakpoint: DebugController["toggleBreakpoint"];
	addBreakpoint: () => void;
	removeBreakpoint: (path: string, line: number) => void;
	runToCursor: (path: string, line: number) => Promise<void>;
};

/** Everything the controller is built from, gathered by the hook. */
export type ControllerInput = {
	state: DebugState;
	root: string | null;
	profileMismatch: string | null;
	preset: string;
	setPreset: (name: string) => void;
	presetEntries: DebugController["presetEntries"];
	launch: LaunchApi;
	transport: TransportApi;
	variables: VariableApi;
	pins: PinApi;
	breakpoints: BreakpointApi;
	rows: DebugController["breakpoints"];
	byPath: DebugController["breakpointsByPath"];
	pinnedKeys: Set<string>;
	toggleExceptionFilter: DebugController["toggleExceptionFilter"];
};

/** The object the debug panel consumes, with async actions wrapped so React sees no floating promise. */
export function assembleController(input: ControllerInput): DebugController {
	const s = input.state;
	return {
		status: s.launching
			? "launching"
			: s.sessionId === null
				? "idle"
				: s.stopView === null
					? "running"
					: "stopped",
		root: input.root,
		error: s.error,
		configError: s.configError,
		sessionId: s.sessionId,
		sessionKind: s.sessionKind,
		sessionBuildProfile: s.sessionBuildProfile,
		profileMismatch: input.profileMismatch,
		restarting: s.restarting,
		restarted: s.restarted,
		pidInput: s.pidInput,
		setPidInput: s.setPidInput,
		attach: () => void input.launch.attach(),
		presetEntries: input.presetEntries,
		presets: s.presets,
		preset: input.preset,
		setPreset: input.setPreset,
		refreshPresets: input.launch.refreshPresets,
		launch: () => void input.launch.launch(),
		resolved: s.resolved,
		buildNeeded: s.buildNeeded,
		building: s.building,
		buildNow: () => void input.launch.buildNow(),
		continueRun: () => void input.transport.continueRun(),
		step: (kind) => void input.transport.step(kind),
		stop: () => void input.transport.stop(),
		restart: () => void input.transport.restart(),
		stopView: s.stopView,
		selectFrame: input.variables.selectFrame,
		children: s.children,
		expanded: s.expanded,
		toggleVariable: input.variables.toggleVariable,
		selectedVariable: s.selectedVariable,
		selectVariable: input.variables.selectVariable,
		setVariable: input.variables.setVariable,
		watchPoints: s.watchPoints,
		addWatchPoint: (containerRef, name) => void input.pins.addWatchPoint(containerRef, name),
		removeWatchPoint: input.pins.removeWatchPoint,
		exceptionFilters: s.exceptionFilters,
		exceptionChecked: s.exceptionChecked,
		toggleExceptionFilter: input.toggleExceptionFilter,
		breakpoints: input.rows,
		breakpointsByPath: input.byPath,
		pins: s.pins,
		pinResults: s.pinResults,
		pinVariable: input.pins.pinVariable,
		unpinVariable: input.pins.unpinVariable,
		togglePin: input.pins.togglePin,
		isPinned: input.pins.isPinned,
		pinnedKeys: input.pinnedKeys,
		setBreakpointField: input.breakpoints.setBreakpointField,
		toggleBreakpoint: input.breakpoints.toggleBreakpoint,
		addBreakpoint: input.breakpoints.addBreakpoint,
		removeBreakpoint: input.breakpoints.removeBreakpoint,
		runToCursor: input.breakpoints.runToCursor,
	};
}
