import { useEffect } from "react";
import { dapStop, openProject, readLaunchConfig } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { DapVariable, ExceptionFilter, LaunchPreset, ProjectKind } from "@/lib/project/api";
import type { Pin, PinResult } from "@/lib/debug/watch";
import type { BreakpointEntry, StopView, VariableRow, WatchRow } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type ResetDeps = {
	root: string | null;
	sessionRef: { current: string | null };
	generationRef: { current: number };
	setSessionId: Setter<string | null>;
	setLaunching: Setter<boolean>;
	setRestarting: Setter<boolean>;
	setStopView: Setter<StopView | null>;
	setChildren: Setter<Map<number, DapVariable[]>>;
	setExpanded: Setter<Set<string>>;
	setSelectedVariable: Setter<VariableRow | null>;
	setWatchPoints: Setter<WatchRow[]>;
	setPins: Setter<Pin[]>;
	setPinResults: Setter<Map<string, PinResult>>;
	setExceptionFilters: Setter<ExceptionFilter[]>;
	setExceptionChecked: Setter<Set<string>>;
	setBreakpointMap: Setter<Map<string, Map<number, BreakpointEntry>>>;
	setError: Setter<string | null>;
	setConfigError: Setter<string | null>;
	setPresets: Setter<LaunchPreset[]>;
	setPresetState: Setter<string>;
	setKind: Setter<ProjectKind | null>;
	setResolved: Setter<import("@/lib/project/api").LaunchConfig | null>;
	setSessionKind: Setter<string | null>;
	setSessionBuildProfile: Setter<"debug" | "release" | null>;
	setAttachPid: Setter<number | null>;
	setPidInput: Setter<string>;
	setBuildNeeded: Setter<string | null>;
	setBuilding: Setter<boolean>;
};

/**
 * Every project switch starts clean: the old session is stopped, every live row is dropped, and the
 * new root's kind and launch presets are read. Values set here never carry across a root.
 */
export function useSessionReset(deps: ResetDeps): void {
	const { root, sessionRef, generationRef } = deps;

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset runs on a root change only
	useEffect(() => {
		generationRef.current += 1;
		const previous = sessionRef.current;
		sessionRef.current = null;
		deps.setSessionId(null);
		deps.setLaunching(false);
		deps.setRestarting(false);
		deps.setStopView(null);
		deps.setChildren(new Map());
		deps.setExpanded(new Set());
		deps.setSelectedVariable(null);
		deps.setWatchPoints([]);
		deps.setPins([]);
		deps.setPinResults(new Map());
		deps.setExceptionFilters([]);
		deps.setExceptionChecked(new Set());
		deps.setBreakpointMap(new Map());
		deps.setError(null);
		deps.setConfigError(null);
		deps.setPresets([]);
		deps.setPresetState("");
		deps.setKind(null);
		deps.setResolved(null);
		deps.setSessionKind(null);
		deps.setSessionBuildProfile(null);
		deps.setAttachPid(null);
		deps.setPidInput("");
		deps.setBuildNeeded(null);
		deps.setBuilding(false);
		if (previous !== null) void dapStop(previous).catch(() => undefined);
		if (root === null) return;
		let live = true;
		/* Kind and presets are independent reads; the select's rows need both, so each lands alone. */
		openProject(root).then(
			(info) => {
				if (live) deps.setKind(info.kind);
			},
			(reason) => {
				if (live) {
					deps.setConfigError(
						(current) => current ?? `Project: ${describeError(reason)}`,
					);
				}
			},
		);
		readLaunchConfig(root).then(
			(file) => {
				if (live) deps.setPresets(file.configurations);
			},
			(reason) => {
				if (live) deps.setConfigError(`Launch config: ${describeError(reason)}`);
			},
		);
		return () => {
			live = false;
		};
	}, [root]);
}
