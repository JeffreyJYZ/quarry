import { useCallback, useEffect, useRef, useState } from "react";
import { buildProject, type LaunchConfig, resolveRunTarget } from "@/lib/project/api";
import { buildThenResolve } from "@/lib/run/buildThenRun";

const NOTICE_PREFIX: Record<"build" | "resolve", string> = {
	build: "Build failed",
	resolve: "Launch failed",
};

/**
 * The Run and Debug buttons: build, resolve, hand the configuration to the shell.
 *
 * The shell owns what happens next (the Run dock, the debug adapter), so it arrives as a callback
 * and this hook stays free of the title bar. Both buttons pass `stopOnEntry: false`: the adapter
 * stops where the user put breakpoints, and a launch that halts on entry is what makes the debug
 * button look broken on a project with no breakpoint yet.
 */
export function useRunLauncher(options: {
	root: string | null;
	profile: "debug" | "release";
	targetId: string | null;
	onRun: (config: LaunchConfig) => void;
	onDebug: (config: LaunchConfig) => void;
	onNotice: (message: string) => void;
}): { run: () => Promise<void>; debug: () => Promise<void>; busy: boolean } {
	const { root, profile, targetId, onRun, onDebug, onNotice } = options;
	const [busy, setBusy] = useState(false);
	const inFlight = useRef(false);
	const generation = useRef(0);

	// A launch still running when the widget unmounts must not set state on the dead component.
	useEffect(() => {
		generation.current += 1;
		return () => {
			generation.current += 1;
		};
	}, []);

	const launch = useCallback(
		async (start: (config: LaunchConfig) => void) => {
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
					build: buildProject,
					resolve: resolveRunTarget,
				});
				if (generation.current !== mine) return;
				if (result.ok) start(result.config);
				else onNotice(`${NOTICE_PREFIX[result.stage]}: ${result.message}`);
			} finally {
				inFlight.current = false;
				if (generation.current === mine) setBusy(false);
			}
		},
		[root, targetId, profile, onNotice],
	);

	const run = useCallback(() => launch(onRun), [launch, onRun]);
	const debug = useCallback(() => launch(onDebug), [launch, onDebug]);

	return { run, debug, busy };
}
