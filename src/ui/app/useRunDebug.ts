import { useCallback, useEffect, useRef } from "react";
import type { LaunchConfig } from "@/lib/project/api";
import type { BuildProfile } from "@/lib/debug/profile";
import type { DebugController } from "@/lib/debug/session";
import type { RunControls } from "@/ui/app/runControlsTypes";
import { useRunLauncher } from "@/lib/run/useRunLauncher";
import { useRunTargets } from "@/lib/run/useRunTargets";

export type RunDebug = {
	/** What the title-bar dropdown renders: detected targets, then launch presets. */
	entries: { value: string; label: string }[];
	selected: string | null;
	setSelected: (id: string) => void;
	/** A project is open and one of its targets is chosen. */
	canRun: boolean;
	/** A build or a launch is in flight. */
	busy: boolean;
	/** Something is running or suspended. */
	live: boolean;
	run: () => void;
	debugNow: () => void;
	stop: () => void;
	refresh: () => Promise<void>;
};

/**
 * The title bar's Run and Debug pair.
 *
 * It owns the target list and the build-then-launch sequence, and hands each half to the hook that
 * can act on it: a run goes to the Run dock's process, a debug launch goes to the debug controller.
 * The two buttons therefore share one sequence and cannot drift into "run builds but debug does
 * not", which is how a debugger starts to look broken.
 */
export function useRunDebug(options: {
	root: string | null;
	profile: BuildProfile;
	runs: RunControls;
	debug: DebugController;
	onReveal: (path: string, line: number, character: number) => void;
	onOpenDebug: () => void;
	onNotice: (message: string) => void;
}): RunDebug {
	const { root, profile, runs, debug, onReveal, onOpenDebug, onNotice } = options;
	const targets = useRunTargets(root);

	const onRun = useCallback(
		(config: LaunchConfig) => {
			void runs.runConfig(config);
		},
		[runs],
	);

	const onDebug = useCallback(
		(config: LaunchConfig) => {
			onOpenDebug();
			debug.launchConfig(config);
		},
		[debug, onOpenDebug],
	);

	const launcher = useRunLauncher({
		root,
		profile,
		targetId: targets.selected,
		onRun,
		onDebug,
		onNotice,
	});

	// A session that starts with the column closed would run invisibly.
	const sessionId = debug.sessionId;
	const openedFor = useRef<string | null>(null);
	useEffect(() => {
		if (sessionId === null) {
			openedFor.current = null;
			return;
		}
		if (openedFor.current === sessionId) return;
		openedFor.current = sessionId;
		onOpenDebug();
	}, [sessionId, onOpenDebug]);

	// Every stop moves the editor to the frame that stopped, the way a debugger is expected to.
	const top = debug.stopView?.frames[0] ?? null;
	const revealed = useRef<string | null>(null);
	useEffect(() => {
		if (top === null || top.source === null || top.line <= 0) return;
		const key = `${top.source}:${top.line}`;
		if (revealed.current === key) return;
		revealed.current = key;
		onReveal(top.source, top.line - 1, 0);
	}, [top, onReveal]);

	const live = runs.running !== null || debug.sessionId !== null;
	const canRun = root !== null && targets.selected !== null;

	return {
		entries: targets.entries,
		selected: targets.selected,
		setSelected: targets.setSelected,
		canRun,
		busy: launcher.busy || debug.building,
		live,
		run: () => void launcher.run(),
		debugNow: () => void launcher.debug(),
		stop: () => {
			if (debug.sessionId !== null) debug.stop();
			else void runs.stop();
		},
		refresh: targets.refresh,
	};
}
