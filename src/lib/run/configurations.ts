import type { EnvVar, RunConfiguration } from "@/lib/project/api";

/** The run form's editable state, which a saved configuration snapshots exactly. */
export type RunFormSnapshot = {
	program: string;
	args: string;
	cwd: string;
	env: EnvVar[];
};

/**
 * Snapshot the form under a name, trimming it so a selection can never carry invisible whitespace.
 *
 * Nothing here is interpreted: `args` stays the raw args field, so loading the configuration back
 * reproduces the identical field and the run path splits it with the same `splitArgs`.
 */
export function snapshotConfiguration(name: string, form: RunFormSnapshot): RunConfiguration {
	return {
		name: name.trim(),
		program: form.program,
		args: form.args,
		cwd: form.cwd,
		env: form.env.map((row): [string, string] => [row.name, row.value]),
	};
}

/** Load a configuration into the form, restoring the env rows in their saved order. */
export function applyConfiguration(config: RunConfiguration): RunFormSnapshot {
	return {
		program: config.program,
		args: config.args,
		cwd: config.cwd,
		env: config.env.map(([name, value]) => ({ name, value })),
	};
}

/**
 * Why a name cannot be used, or `null` when it can.
 *
 * `keep` is the name an update is allowed to keep; every other existing name is a duplicate.
 */
export function configurationNameError(
	name: string,
	configurations: RunConfiguration[],
	keep?: string | null,
): string | null {
	const trimmed = name.trim();
	if (trimmed === "") {
		return "configuration name is required";
	}
	const clash = configurations.some(
		(config) => config.name === trimmed && config.name !== (keep ?? null),
	);
	return clash ? `duplicate configuration name: ${trimmed}` : null;
}
