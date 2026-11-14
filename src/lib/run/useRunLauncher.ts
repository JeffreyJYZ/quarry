import { useCallback, useEffect, useRef, useState } from "react";
import {
	type LaunchConfig,
	programExists,
	resolveLaunchConfig,
	resolveRunTarget,
} from "@/lib/project/api";
import { buildOnce } from "@/lib/project/buildOnce";
import { describeError } from "@/lib/project/errors";
import { type ManualFallback, buildThenResolve } from "@/lib/run/buildThenRun";
import { runCwd } from "@/lib/run/cwd";
import type { LaunchFailure } from "@/lib/run/failureLines";
import { splitArgs } from "@/lib/run/splitArgs";
import type { BuildProfile } from "@/lib/settings/model";

/** Which button asked for the launch. Run has a console; Debug reports somewhere else. */
export type LaunchSource = "run" | "debug";

/** The Run form's fields, as the fallback a build that names no executable hands over. */
export type RunFormFallback = { program: string; args: string; cwd: string };

/**
 * The Run and Debug buttons: build, resolve, hand the configuration to the shell.
 *
 * The shell owns what happens next (the Run dock, the debug adapter), so it arrives as a callback
 * and this hook stays free of the title bar. Both buttons pass `stopOnEntry: false`: the adapter
 * stops where the user put breakpoints, and a launch that halts on entry is what makes the debug
 * button look broken on a project with no breakpoint yet.
 *
 * A selection can name a detected target or a `.quarry/launch.json` preset, and the two resolve
 * through different commands: a preset is `resolve_launch_config` and builds the whole project,
 * because its name is not a CMake target.
 *
 * The Run form's program is the fallback when the build reports no executable, so the message that
 * sends users to that field is true of this button too. It is only a fallback: an artifact the
 * build named still replaces it.
 *
 * A failure goes out whole — the compiler's diagnostics included — and names which button asked,
 * because a run's failure belongs in the console where its output would have been while a debug
 * launch has none to print into.
 *
 * A project switch cancels the launch: the build describes the old tree and must not start anything
 * here, and its busy flag must not keep the new project's buttons disabled.
 */
export function useRunLauncher(options: {
	root: string | null;
	profile: BuildProfile;
	targetId: string | null;
	/** True when `targetId` names a launch.json preset instead of a detected target. */
	isPreset?: boolean;
	/** The Run form's fields; an empty program means there is no fallback. */
	runForm?: RunFormFallback;
	onRun: (config: LaunchConfig) => void;
	onDebug: (config: LaunchConfig) => void;
	onFailure: (failure: LaunchFailure, source: LaunchSource) => void;
}): { run: () => Promise<void>; debug: () => Promise<void>; busy: boolean } {
	const {
		root,
		profile,
		targetId,
		isPreset = false,
		runForm = { program: "", args: "", cwd: "" },
		onRun,
		onDebug,
		onFailure,
	} = options;
	const [busy, setBusy] = useState(false);
	const inFlight = useRef(false);
	const generation = useRef(0);
	const manualProgram = runForm.program.trim();
	const manualArgs = runForm.args;
	const manualCwd = runForm.cwd;

	// One launch per root: a new root starts idle, and the cleanup guards a launch that is still
	// running when the widget unmounts from setting state on the dead component.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the reset runs on a root change only
	useEffect(() => {
		generation.current += 1;
		inFlight.current = false;
		setBusy(false);
		return () => {
			generation.current += 1;
		};
	}, [root]);

	const launch = useCallback(
		async (start: (config: LaunchConfig) => void, source: LaunchSource) => {
			if (root === null || targetId === null || inFlight.current) return;
			inFlight.current = true;
			const mine = generation.current;
			setBusy(true);
			const manualFallback: ManualFallback | null =
				manualProgram === ""
					? null
					: {
							config: {
								program: manualProgram,
								args: splitArgs(manualArgs),
								cwd: runCwd(manualCwd, root),
								stopOnEntry: false,
								initCommands: [],
							},
							exists: programExists,
						};
			try {
				let resolveTarget: (
					project: string,
					id: string,
					stopOnEntry: boolean,
				) => Promise<LaunchConfig> = resolveRunTarget;
				let fallback = manualFallback;
				if (isPreset) {
					// A preset names its program in launch.json, so it is read before the build: an
					// up-to-date build names no executable, and the preset's program is then the only
					// thing to launch. Reading the file is not a build, and the config is reused.
					let preset: LaunchConfig;
					try {
						preset = await resolveLaunchConfig(root, targetId);
					} catch (error) {
						if (generation.current !== mine) return;
						onFailure(
							{ stage: "resolve", message: describeError(error), diagnostics: [] },
							source,
						);
						return;
					}
					resolveTarget = async () => preset;
					fallback = { config: preset, exists: programExists };
				}
				const result = await buildThenResolve({
					root,
					targetId,
					profile,
					stopOnEntry: false,
					build: isPreset
						? (project, buildProfile) => buildOnce(project, buildProfile, null)
						: buildOnce,
					resolve: resolveTarget,
					fallback,
				});
				if (generation.current !== mine) return;
				if (result.ok) {
					start(result.config);
					return;
				}
				onFailure(
					{
						stage: result.stage,
						message: result.message,
						diagnostics: result.diagnostics,
					},
					source,
				);
			} finally {
				if (generation.current === mine) {
					inFlight.current = false;
					setBusy(false);
				}
			}
		},
		[root, targetId, profile, isPreset, manualProgram, manualArgs, manualCwd, onFailure],
	);

	const run = useCallback(() => launch(onRun, "run"), [launch, onRun]);
	const debug = useCallback(() => launch(onDebug, "debug"), [launch, onDebug]);

	return { run, debug, busy };
}
