import { useEffect, useRef } from "react";
import { joinArgs } from "@/lib/debug/presets";
import { type EnvVar, defaultLaunchConfig, type RunFormEntry } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type RunFormState = {
	program: string;
	args: string;
	cwd: string;
	env: EnvVar[];
};

/** The stored form of one project, in the shape the settings file keeps. */
function toEntry(root: string, form: RunFormState): RunFormEntry {
	return {
		root,
		program: form.program,
		args: form.args,
		cwd: form.cwd,
		env: form.env.map((row) => [row.name, row.value]),
	};
}

function fromEntry(entry: RunFormEntry): RunFormState {
	return {
		program: entry.program,
		args: entry.args,
		cwd: entry.cwd,
		env: entry.env.map(([name, value]) => ({ name, value })),
	};
}

/**
 * Remembers the run form per project root, and reports it for the settings file.
 *
 * Switching projects restores what was typed last time for that root, or the backend's default
 * launch configuration when the root is new: the built binary of a Cargo project, or the
 * conventional build output of a C/C++ one, which the backend names even before the first build.
 *
 * The form is reported through `onChange` so the shell can persist it beside the saved
 * configurations. A project root that has been restored once is the only one reported, because a
 * root whose restore is still in flight would otherwise write the empty form over the program the
 * file already held.
 *
 * The restore runs once per root. The handler arrives as an inline closure, so keeping it in a ref
 * is what stops an identity change on every render from refetching the configuration and rewriting
 * the form.
 *
 * Every field the user can edit is remembered, `program` included: a hand-set binary that existed
 * only in the stored args and cwd would be replaced by the detected default on the way back into a
 * project, and a restart would drop it entirely. The default configuration's argv goes through
 * `joinArgs`, so an argument with a space is written quoted and `splitArgs` gives it back on the
 * next run.
 */
export function useRunFormMemory(options: {
	root: string | null;
	form: RunFormState;
	/** The forms the settings file held when the session started; a later report never overwrites one. */
	initial?: RunFormEntry[];
	onRestore: (next: RunFormState) => void;
	onChange?: (next: RunFormEntry[]) => void;
	onNotice?: (message: string) => void;
}): void {
	const { root, form, initial, onRestore, onChange, onNotice } = options;
	const memory = useRef<Map<string, RunFormState>>(new Map());
	const restoreRef = useRef(onRestore);
	restoreRef.current = onRestore;
	const changeRef = useRef(onChange);
	changeRef.current = onChange;
	/** Roots whose form has been restored, so an in-flight fetch cannot be reported as empty. */
	const settled = useRef<Set<string>>(new Set());
	const reported = useRef<Set<string>>(new Set());
	const lastReported = useRef("");

	// Seed from the file first, and only for roots this session has not touched: an open project's
	// form is newer than the one on disk.
	useEffect(() => {
		for (const entry of initial ?? []) {
			if (memory.current.has(entry.root)) continue;
			memory.current.set(entry.root, fromEntry(entry));
		}
		lastReported.current = JSON.stringify(
			[...memory.current.entries()].map(([key, state]) => toEntry(key, state)),
		);
	}, [initial]);

	useEffect(() => {
		if (root === null) return;
		const saved = memory.current.get(root);
		let cancelled = false;
		void defaultLaunchConfig(root, false)
			.then((config) => {
				if (cancelled) return;
				settled.current.add(root);
				restoreRef.current(
					saved === undefined
						? {
								program: config.program,
								args: joinArgs(config.args),
								cwd: config.cwd,
								env: [],
							}
						: saved,
				);
			})
			.catch((error: unknown) => {
				settled.current.add(root);
				if (root !== null && !reported.current.has(root)) {
					reported.current.add(root);
					onNotice?.(`no default launch configuration: ${describeError(error)}`);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [root, onNotice]);

	useEffect(() => {
		if (root === null) return;
		memory.current.set(root, {
			program: form.program,
			args: form.args,
			cwd: form.cwd,
			env: form.env,
		});
		if (!settled.current.has(root)) return;
		const next = [...memory.current.entries()].map(([key, state]) => toEntry(key, state));
		const text = JSON.stringify(next);
		if (text === lastReported.current) return;
		lastReported.current = text;
		changeRef.current?.(next);
	}, [root, form]);
}
