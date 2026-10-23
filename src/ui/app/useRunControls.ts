import { useCallback, useEffect, useRef, useState } from "react";
import {
	type EnvVar,
	type RunConfiguration,
	onRunExited,
	onRunOutput,
	runProgram,
	stopProgram,
} from "@/lib/project/api";
import { splitArgs } from "@/lib/run/splitArgs";
import type { RunLine } from "@/ui/run/RunLog";
import { useRunConfigurations } from "@/ui/app/useRunConfigurations";
import { useRunFormMemory } from "@/ui/app/useRunFormMemory";
import type { RunControls, RunExit } from "@/ui/app/runControlsTypes";
export type { RunControls, RunExit } from "@/ui/app/runControlsTypes";

/**
 * The run tool window: the form's fields, its saved configurations, and the child process.
 *
 * The hook owns the whole cluster so the shell only renders `RunSection` and reads the handful of
 * values it needs elsewhere (the Build button and the palette commands).
 */
export function useRunControls(options: {
	root: string | null;
	initialConfigurations: RunConfiguration[];
	onConfigurationsChange: (next: RunConfiguration[]) => void;
	onNotice: (message: string) => void;
}): RunControls {
	const { root, initialConfigurations, onConfigurationsChange, onNotice } = options;
	const [panelOpen, setPanelOpen] = useState(false);
	const [running, setRunning] = useState<string | null>(null);
	const [lines, setLines] = useState<RunLine[]>([]);
	const [exited, setExited] = useState<RunExit | null>(null);
	const [program, setProgram] = useState("");
	const [args, setArgs] = useState("");
	const [cwd, setCwd] = useState("");
	const [env, setEnv] = useState<EnvVar[]>([]);
	const [configurations, setConfigurations] = useState<RunConfiguration[]>(initialConfigurations);
	const [selected, setSelected] = useState<string | null>(null);

	const { select, save, update, remove } = useRunConfigurations({
		configurations,
		selected,
		setConfigurations,
		setSelected,
		form: { program, args, cwd, env },
		onFill: (next) => {
			setProgram(next.program);
			setArgs(next.args);
			setCwd(next.cwd);
			setEnv(next.env);
		},
	});

	const runningRef = useRef<string | null>(null);
	useEffect(() => {
		runningRef.current = running;
	}, [running]);

	useEffect(() => {
		onConfigurationsChange(configurations);
	}, [configurations, onConfigurationsChange]);

	// One listener pair for the lifetime of the panel; the run id is the key.
	useEffect(() => {
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		let cancelled = false;
		void (async () => {
			try {
				unOutput = await onRunOutput((event) => {
					if (event.runId !== runningRef.current) return;
					setLines((current) => {
						const next = [...current, { stream: event.stream, line: event.line }];
						return next.length > 2000 ? next.slice(next.length - 2000) : next;
					});
				});
				unExited = await onRunExited((event) => {
					if (event.runId !== runningRef.current) return;
					setExited({ code: event.code });
					setRunning(null);
				});
			} catch {
				/* a listener that never registered leaves the log to the next run */
			}
			if (cancelled) {
				unOutput?.();
				unExited?.();
			}
		})();
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
		};
	}, []);

	useRunFormMemory({
		root,
		form: { program, args, cwd, env },
		onRestore: (next) => {
			setProgram(next.program);
			setArgs(next.args);
			setCwd(next.cwd);
			setEnv(next.env);
		},
	});

	const run = useCallback(async () => {
		if (root === null) {
			onNotice("Open a project before running anything");
			return;
		}
		if (running !== null) return;
		// A run with nothing to launch must say so and show the panel: a silent return looks like a
		// dead button.
		if (program === "") {
			setPanelOpen(true);
			onNotice("No program to run yet: set one in the Run panel");
			return;
		}
		if (!cwd.startsWith("/")) {
			setPanelOpen(true);
			onNotice("Working directory must be an absolute path");
			return;
		}
		setLines([]);
		setExited(null);
		try {
			const id = await runProgram(
				program,
				splitArgs(args),
				cwd,
				env.length === 0 ? undefined : env,
			);
			setRunning(id);
		} catch (error) {
			onNotice(error instanceof Error ? error.message : String(error));
		}
	}, [root, running, program, args, cwd, env, onNotice]);

	const stop = useCallback(async () => {
		const id = running;
		if (id === null) return;
		try {
			await stopProgram(id);
		} catch (error) {
			onNotice(error instanceof Error ? error.message : String(error));
		}
		setExited((current) => (current === null ? { code: null, killed: true } : current));
		setRunning(null);
	}, [running, onNotice]);

	const clearLog = useCallback(() => {
		setLines([]);
		setExited(null);
	}, []);

	return {
		panelOpen,
		openPanel: () => setPanelOpen(true),
		closePanel: () => setPanelOpen(false),
		running,
		lines,
		exited,
		program,
		args,
		cwd,
		env,
		configurations,
		selected,
		argv: [program, ...splitArgs(args)].join(" "),
		setProgram,
		setArgs,
		setCwd,
		setEnv,
		select,
		save,
		update,
		remove,
		run,
		stop,
		clearLog,
		replaceConfigurations: (next: RunConfiguration[]) => setConfigurations(next),
	};
}
