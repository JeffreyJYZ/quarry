import { useCallback } from "react";
import {
	dapConfigurationDone,
	dapLaunch,
	type LaunchConfig,
	type LaunchPreset,
	type ExceptionFilter,
	defaultLaunchConfig,
	readLaunchConfig,
	resolveLaunchConfig,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { BuildProfile } from "@/lib/debug/profile";
import { CARGO_DEFAULT, CARGO_STOP_ON_ENTRY, type StopView, asksForBuild } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type LaunchDeps = {
	rootRef: { current: string | null };
	presetRef: { current: string };
	sessionRef: { current: string | null };
	buildProfile: BuildProfile;
	buildNeeded: string | null;
	building: boolean;
	pidInput: string;
	syncAll: () => Promise<void>;
	loadExceptionFilters: (session: string, preserveChecked: boolean) => Promise<void>;
	setError: (message: string | null) => void;
	setLaunching: Setter<boolean>;
	setStopView: Setter<StopView | null>;
	setBuildNeeded: Setter<string | null>;
	setResolved: Setter<LaunchConfig | null>;
	setSessionId: Setter<string | null>;
	setSessionKind: Setter<string | null>;
	setSessionBuildProfile: Setter<BuildProfile | null>;
	setRestarted: Setter<boolean>;
	setAttachPid: Setter<number | null>;
	setPidInput: Setter<string>;
	setExceptionChecked: Setter<Set<string>>;
	setExceptionFilters: Setter<ExceptionFilter[]>;
	setBuilding: Setter<boolean>;
	setPresets: Setter<LaunchPreset[]>;
	setConfigError: Setter<string | null>;
};

/** Launching, building the missing binary once, attaching, and starting a shell-resolved config. */
export function useLaunch(deps: LaunchDeps) {
	const {
		rootRef,
		presetRef,
		sessionRef,
		buildProfile,
		syncAll,
		loadExceptionFilters,
		setError,
		setLaunching,
		setStopView,
		setResolved,
		setSessionId,
		setSessionKind,
		setSessionBuildProfile,
		setRestarted,
		setExceptionChecked,
		setExceptionFilters,
		setPresets,
		setConfigError,
	} = deps;

	/**
	 * Start an adapter session for one resolved configuration and run its handshake.
	 *
	 * Every entry point goes through here: the preset Launch button, the shell's Run/Debug widget and
	 * the build-then-relaunch path, so a session is registered, its breakpoints pushed and
	 * `configurationDone` sent exactly once and in that order.
	 */
	const start = useCallback(
		async (config: LaunchConfig) => {
			const rootNow = rootRef.current;
			if (rootNow === null) {
				setError("Open a project first");
				return;
			}
			if (sessionRef.current !== null) {
				setError("A debug session is already running");
				return;
			}
			setLaunching(true);
			setError(null);
			setStopView(null);
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
			setSessionBuildProfile(buildProfile);
			setRestarted(false);
			setLaunching(false);
			setExceptionFilters([]);
			setExceptionChecked(new Set());
			/* A fresh adapter knows nothing about rows from an earlier session. */
			await syncAll();
			await loadExceptionFilters(id, false);
			try {
				await dapConfigurationDone(id);
			} catch (reason) {
				setError(`Configuration done: ${describeError(reason)}`);
			}
		},
		[
			rootRef,
			sessionRef,
			syncAll,
			loadExceptionFilters,
			buildProfile,
			setError,
			setLaunching,
			setStopView,
			setResolved,
			setSessionId,
			setSessionKind,
			setSessionBuildProfile,
			setRestarted,
			setExceptionChecked,
			setExceptionFilters,
		],
	);

	/** The one place a select value becomes a configuration; a preset and Cargo differ. */
	const resolveConfig = useCallback(async (root: string, name: string) => {
		if (name === CARGO_DEFAULT) return defaultLaunchConfig(root, CARGO_STOP_ON_ENTRY);
		return resolveLaunchConfig(root, name);
	}, []);

	/**
	 * Launch the selected configuration. A missing binary offers one build; every other rejection
	 * is a plain error line.
	 */
	const launch = useCallback(
		async (offerBuild = true, programOverride: string | null = null) => {
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
			let config: LaunchConfig;
			try {
				config = await resolveConfig(rootNow, name);
			} catch (reason) {
				const message = describeError(reason);
				if (offerBuild && asksForBuild(message)) {
					deps.setBuildNeeded(message);
					setError(message);
					return;
				}
				setError(`Launch: ${message}`);
				return;
			}
			if (programOverride !== null && programOverride !== "") {
				config = { ...config, program: programOverride };
			}
			await start(config);
		},
		[deps, resolveConfig, rootRef, presetRef, sessionRef, setError, start],
	);

	/** Re-read launch.json and keep the selection when the file still names it. */
	const refreshPresets = useCallback(async () => {
		const rootNow = rootRef.current;
		if (rootNow === null) return;
		try {
			const file: { configurations: LaunchPreset[] } = await readLaunchConfig(rootNow);
			setPresets(file.configurations);
		} catch (reason) {
			setConfigError(`Launch config: ${describeError(reason)}`);
		}
	}, [rootRef, setPresets, setConfigError]);

	return { launch, launchConfig: start, refreshPresets };
}
