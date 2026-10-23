import { useEffect, useRef } from "react";
import { type EnvVar, defaultLaunchConfig } from "@/lib/project/api";

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
 * launch configuration when the root is new.
 */
export function useRunFormMemory(options: {
	root: string | null;
	form: RunFormState;
	onRestore: (next: RunFormState) => void;
}): void {
	const { root, form, onRestore } = options;
	const memory = useRef<Map<string, { args: string; cwd: string; env: EnvVar[] }>>(new Map());

	useEffect(() => {
		if (root === null) return;
		const saved = memory.current.get(root);
		void defaultLaunchConfig(root, false)
			.then((config) => {
				if (saved === undefined) {
					onRestore({
						program: config.program,
						args: config.args.join(" "),
						cwd: config.cwd,
						env: [],
					});
				} else {
					onRestore({
						program: config.program,
						args: saved.args,
						cwd: saved.cwd,
						env: saved.env ?? [],
					});
				}
			})
			.catch(() => {
				/* a project without a launchable artefact keeps the form empty */
			});
	}, [root, onRestore]);

	useEffect(() => {
		if (root === null) return;
		memory.current.set(root, { args: form.args, cwd: form.cwd, env: form.env });
	}, [root, form]);
}
