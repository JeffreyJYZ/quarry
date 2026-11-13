import type { EnvVar } from "@/lib/project/api";

type Envelope = { payload: unknown };
type Sink = (event: Envelope) => void;

/** One `run_program` call the fake backend received. */
export type RunStart = { program: string; args: string[]; cwd: string; env: EnvVar[] };

/**
 * The fake backend behind the run API, for tests that need a program's console.
 *
 * It sits at the Tauri seam and not at `@/lib/project/api`, because that module — and the hooks
 * above it — are shared with every other test file: a `mock.module` for a shared module stays
 * installed past the file that registered it and silently swaps the code another file is testing.
 * Two files registering the same seam are harmless as long as they share this one state object.
 */
export const runBackend = {
	/** Listeners the console registered, by event name. */
	sinks: {} as Record<string, Sink[]>,
	/** Every start the hooks made, in order. */
	starts: [] as RunStart[],
	/** Run ids the fake backend handed out, in order. */
	ids: [] as string[],
	nextId: 1,
	/** Held while a start command is in flight, for a test that emits inside that window. */
	gate: null as Promise<void> | null,

	reset() {
		for (const name of Object.keys(runBackend.sinks)) delete runBackend.sinks[name];
		runBackend.starts.length = 0;
		runBackend.ids.length = 0;
		runBackend.nextId = 1;
		runBackend.gate = null;
	},

	invoke: async (command: string, args?: Record<string, unknown>) => {
		if (command === "run_program") {
			const id = `run-${runBackend.nextId}`;
			runBackend.nextId += 1;
			runBackend.ids.push(id);
			runBackend.starts.push({
				program: String(args?.program ?? ""),
				args: (args?.args as string[] | undefined) ?? [],
				cwd: String(args?.cwd ?? ""),
				env: (args?.env as EnvVar[] | null | undefined) ?? [],
			});
			if (runBackend.gate !== null) await runBackend.gate;
			return id;
		}
		if (command === "default_launch_config") {
			return { program: "", args: [], cwd: "", stopOnEntry: false, initCommands: [] };
		}
		if (command === "stop_program") return { escalated: false };
		return undefined;
	},

	listen: async (name: string, handler: Sink) => {
		runBackend.sinks[name] ??= [];
		runBackend.sinks[name].push(handler);
		return () => undefined;
	},

	/** One output chunk of the given run, as the backend emits it. */
	output(runId: string, line: string, seq = 1) {
		for (const sink of runBackend.sinks["run://output"] ?? []) {
			sink({ payload: { runId, seq, stream: "stdout", line, more: false } });
		}
	},

	/** The run's exit, emitted after its last line. */
	exit(runId: string) {
		for (const sink of runBackend.sinks["run://exited"] ?? []) {
			sink({ payload: { runId, seq: 999, code: 0, signal: null } });
		}
	},
};
