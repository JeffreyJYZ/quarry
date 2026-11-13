import { useCallback, useEffect, useRef, useState } from "react";
import { type LaunchConfig, resolveRunTarget } from "@/lib/project/api";
import { buildOnce } from "@/lib/project/buildOnce";
import { buildThenResolve } from "@/lib/run/buildThenRun";
import type { LaunchFailure } from "@/lib/run/failureLines";
import type { BuildProfile } from "@/lib/settings/model";

/** Which button asked for the launch. Run has a console; Debug reports somewhere else. */
export type LaunchSource = "run" | "debug";

/**
 * The Run and Debug buttons: build, resolve, hand the configuration to the shell.
 *
 * The shell owns what happens next (the Run dock, the debug adapter), so it arrives as a callback
 * and this hook stays free of the title bar. Both buttons pass `stopOnEntry: false`: the adapter
 * stops where the user put breakpoints, and a launch that halts on entry is what makes the debug
 * button look broken on a project with no breakpoint yet.
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
	onRun: (config: LaunchConfig) => void;
	onDebug: (config: LaunchConfig) => void;
	onFailure: (failure: LaunchFailure, source: LaunchSource) => void;
}): { run: () => Promise<void>; debug: () => Promise<void>; busy: boolean } {
	const { root, profile, targetId, onRun, onDebug, onFailure } = options;
	const [busy, setBusy] = useState(false);
	const inFlight = useRef(false);
	const generation = useRef(0);

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
			try {
				const result = await buildThenResolve({
					root,
					targetId,
					profile,
					stopOnEntry: false,
					build: buildOnce,
					resolve: resolveRunTarget,
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
		[root, targetId, profile, onFailure],
	);

	const run = useCallback(() => launch(onRun, "run"), [launch, onRun]);
	const debug = useCallback(() => launch(onDebug, "debug"), [launch, onDebug]);

	return { run, debug, busy };
}
