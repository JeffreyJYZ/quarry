import { useCallback, useEffect, useState } from "react";
import type { EnvVar, LaunchConfig, RunConfiguration } from "@/lib/project/api";
import { joinArgs } from "@/lib/debug/presets";
import { isAbsoluteRunPath, runCwd } from "@/lib/run/cwd";
import { splitArgs } from "@/lib/run/splitArgs";
import { useRunProcess } from "@/lib/run/useRunProcess";
import { useRunConfigurations } from "@/ui/app/useRunConfigurations";
import { useRunFormMemory } from "@/ui/app/useRunFormMemory";
import type { RunControls } from "@/ui/app/runControlsTypes";
export type { RunControls, RunExit } from "@/ui/app/runControlsTypes";

/**
 * The run tool window: the form's fields, its saved configurations, and the child process.
 *
 * The process and its log live in `useRunProcess`, so the Run form and a detected target's resolved
 * configuration can both start a run without either one owning the console.
 */
export function useRunControls(options: {
	root: string | null;
	initialConfigurations: RunConfiguration[];
	onConfigurationsChange: (next: RunConfiguration[]) => void;
	onNotice: (message: string) => void;
}): RunControls {
	const { root, initialConfigurations, onConfigurationsChange, onNotice } = options;
	const [panelOpen, setPanelOpen] = useState(false);
	const [program, setProgram] = useState("");
	const [args, setArgs] = useState("");
	const [cwd, setCwd] = useState("");
	const [env, setEnv] = useState<EnvVar[]>([]);
	const [configurations, setConfigurations] = useState<RunConfiguration[]>(initialConfigurations);
	const [selected, setSelected] = useState<string | null>(null);

	const proc = useRunProcess(onNotice);
	const { running, lines, exited } = proc;

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

	useEffect(() => {
		onConfigurationsChange(configurations);
	}, [configurations, onConfigurationsChange]);

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
		// An empty field means the project root, so a configuration saved before the form was
		// prefilled still runs instead of failing on a path it never showed.
		const directory = runCwd(cwd, root);
		if (!isAbsoluteRunPath(directory)) {
			setPanelOpen(true);
			onNotice("Working directory must be an absolute path");
			return;
		}
		await proc.start(program, splitArgs(args), directory, env);
	}, [root, running, program, args, cwd, env, onNotice, proc]);

	/**
	 * Run one resolved configuration: the detected target's binary, or a preset's.
	 *
	 * The form fields take the configuration's values so the log's command line matches what ran;
	 * the form is the only place a run's argv is displayed.
	 */
	const runConfig = useCallback(
		async (config: LaunchConfig) => {
			if (root === null || running !== null) return;
			setProgram(config.program);
			setArgs(joinArgs(config.args));
			setCwd(config.cwd);
			await proc.start(config.program, config.args, runCwd(config.cwd, root), env);
		},
		[root, running, env, proc],
	);

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
		runConfig,
		stop: proc.stop,
		clearLog: proc.clear,
		replaceConfigurations: (next: RunConfiguration[]) => setConfigurations(next),
	};
}
