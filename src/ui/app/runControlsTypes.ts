import type { EnvVar, LaunchConfig, RunConfiguration } from "@/lib/project/api";
import type { RunLine } from "@/ui/run/RunLog";

export type RunExit = { code: number | null; killed?: boolean };

export type RunControls = {
	panelOpen: boolean;
	openPanel: () => void;
	closePanel: () => void;
	running: string | null;
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
	replaceConfigurations: (next: RunConfiguration[]) => void;
};
