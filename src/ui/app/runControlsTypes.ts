import type { EnvVar, LaunchConfig, RunConfiguration } from "@/lib/project/api";
import type { RunExit, RunLine } from "@/lib/run/runOutput";

export type { RunExit, RunLine } from "@/lib/run/runOutput";

export type RunControls = {
	panelOpen: boolean;
	/** The console holds something to read even though no process is running. */
	consoleOpen: boolean;
	openPanel: () => void;
	closePanel: () => void;
	running: string | null;
	/** Stop was sent and the backend has not reported the exit yet. */
	stopping: boolean;
	lines: RunLine[];
	exited: RunExit | null;
	program: string;
	args: string;
	cwd: string;
	env: EnvVar[];
	configurations: RunConfiguration[];
	selected: string | null;
	argv: string;
	setProgram: (value: string) => void;
	setArgs: (value: string) => void;
	setCwd: (value: string) => void;
	setEnv: (value: EnvVar[]) => void;
	select: (name: string) => void;
	save: (name: string) => string | null;
	update: () => string | null;
	remove: () => string | null;
	run: () => Promise<void>;
	/** Run one already-resolved configuration, the path the Run button takes for a target. */
	runConfig: (config: LaunchConfig) => Promise<void>;
	stop: () => Promise<void>;
	clearLog: () => void;
	/** Write lines into the console and open it: a failed build never started a process. */
	appendLog: (lines: string[]) => void;
	replaceConfigurations: (next: RunConfiguration[]) => void;
};
