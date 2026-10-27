import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type LaunchConfig = {
	program: string;
	args: string[];
	cwd: string;
	stopOnEntry: boolean;
	initCommands: string[];
};

export type LaunchPreset = {
	name: string;
	program: string | null;
	args: string[];
	cwd: string | null;
	build: string | null;
	stopOnEntry: boolean;
	initCommands: string[];
};

export type LaunchFile = { configurations: LaunchPreset[] };

/** One runnable target the backend detected, before any configuration exists. */
export type RunTarget = {
	id: string;
	label: string;
	kind: "cargo" | "cpp";
	package: string;
	target: string;
};

export type RunOutputEvent = { runId: string; stream: "stdout" | "stderr"; line: string };
export type RunExitedEvent = { runId: string; code: number | null };
export type EnvVar = { name: string; value: string };

export function readLaunchConfig(root: string): Promise<LaunchFile> {
	return invoke<LaunchFile>("read_launch_config", { root });
}

export function writeLaunchConfig(root: string, file: LaunchFile): Promise<string> {
	return invoke<string>("write_launch_config", { root, file });
}

export function resolveLaunchConfig(root: string, name: string): Promise<LaunchConfig> {
	return invoke<LaunchConfig>("resolve_launch_config", { root, name });
}

export function defaultLaunchConfig(root: string, stopOnEntry: boolean): Promise<LaunchConfig> {
	return invoke<LaunchConfig>("default_launch_config", { root, stopOnEntry });
}

/** Every target the project can run, without building it first. */
export function listRunTargets(root: string): Promise<RunTarget[]> {
	return invoke<RunTarget[]>("list_run_targets", { root });
}

/** The launch configuration for one detected target, built or not. */
export function resolveRunTarget(
	root: string,
	id: string,
	stopOnEntry: boolean,
): Promise<LaunchConfig> {
	return invoke<LaunchConfig>("resolve_run_target", { root, id, stopOnEntry });
}

export function runProgram(
	program: string,
	args: string[],
	cwd: string,
	env?: EnvVar[],
): Promise<string> {
	return invoke<string>("run_program", { program, args, cwd, env: env ?? null });
}

export function stopProgram(runId: string): Promise<void> {
	return invoke<void>("stop_program", { runId });
}

export function onRunOutput(handler: (event: RunOutputEvent) => void): Promise<() => void> {
	return listen<RunOutputEvent>("run://output", (event) => handler(event.payload));
}

export function onRunExited(handler: (event: RunExitedEvent) => void): Promise<() => void> {
	return listen<RunExitedEvent>("run://exited", (event) => handler(event.payload));
}
