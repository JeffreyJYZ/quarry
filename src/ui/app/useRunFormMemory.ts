import { useEffect, useRef } from "react";
import { type EnvVar, defaultLaunchConfig } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type RunFormState = {
	program: string;
	args: string;
	cwd: string;
	env: EnvVar[];
};

/**
 * Remembers the run form per project root.
 *
 * Switching projects restores what was typed last time for that root, or the backend's default
 * launch configuration when the root is new: the built binary of a Cargo project, or the
 * conventional build output of a C/C++ one, which the backend names even before the first build.
 *
 * The restore runs once per root. The handler arrives as an inline closure, so keeping it in a ref
 * is what stops an identity change on every render from refetching the configuration and rewriting
 * the form.
 */
export function useRunFormMemory(options: {
	root: string | null;
	form: RunFormState;
	onRestore: (next: RunFormState) => void;
	onNotice?: (message: string) => void;
}): void {
	const { root, form, onRestore, onNotice } = options;
	const memory = useRef<Map<string, { args: string; cwd: string; env: EnvVar[] }>>(new Map());
	const restoreRef = useRef(onRestore);
	restoreRef.current = onRestore;
	const reported = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (root === null) return;
		const saved = memory.current.get(root);
		let cancelled = false;
		void defaultLaunchConfig(root, false)
			.then((config) => {
				if (cancelled) return;
				restoreRef.current(
					saved === undefined
						? {
								program: config.program,
								args: config.args.join(" "),
								cwd: config.cwd,
								env: [],
							}
						: {
								program: config.program,
								args: saved.args,
								cwd: saved.cwd,
								env: saved.env ?? [],
							},
				);
			})
			.catch((error: unknown) => {
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
		memory.current.set(root, { args: form.args, cwd: form.cwd, env: form.env });
	}, [root, form]);
}
