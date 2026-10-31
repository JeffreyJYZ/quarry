import {
	type LaunchPreset,
	onRunExited,
	onRunOutput,
	readLaunchConfig,
	runProgram,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { CARGO_DEFAULT } from "@/lib/debug/sessionTypes";

/** Output arrives before the run id is known, so it waits here until it is. */
const MAX_PENDING = 400;

/** The tail kept for the failure message: enough to name the real error, not the whole build. */
const TAIL = 20;

export type BuildOutcome = { ok: boolean; code: number | null; lines: string[] };

/**
 * Run one build command line, the way a terminal would.
 *
 * A preset's `build` field is a shell line — `cargo build`, `cmake --build build`, `make -j8 && cp …` —
 * and isn't a program plus arguments. It goes through the user's login shell so their PATH is the one
 * a terminal has: a Dock-launched app otherwise sees `/usr/bin:/bin:/usr/sbin:/sbin` and reports
 * `cargo: not found`.
 */
export async function runBuildCommand(root: string, command: string): Promise<BuildOutcome> {
	const windows = navigator.userAgent.includes("Windows");
	const shell = windows ? "C:\\Windows\\System32\\cmd.exe" : "/bin/zsh";
	const args = windows ? ["/C", command] : ["-lc", command];

	const lines: string[] = [];
	const pending = new Map<string, string[]>();
	const exits = new Map<string, number | null>();
	let runId: string | null = null;
	let settle: (outcome: BuildOutcome) => void = () => undefined;
	const done = new Promise<BuildOutcome>((resolve) => {
		settle = resolve;
	});

	// Listeners first: a command that prints and exits immediately would otherwise be missed.
	const unOutput = await onRunOutput((event) => {
		if (runId !== null && event.runId === runId) {
			lines.push(event.line);
			return;
		}
		const buffer = pending.get(event.runId) ?? [];
		if (buffer.length >= MAX_PENDING) return;
		buffer.push(event.line);
		pending.set(event.runId, buffer);
	});
	const unExited = await onRunExited((event) => {
		if (runId !== null && event.runId === runId) {
			exits.set(event.runId, event.code);
			settle({ ok: event.code === 0, code: event.code, lines });
			return;
		}
		exits.set(event.runId, event.code);
	});

	const finish = (outcome: BuildOutcome) => {
		unOutput?.();
		unExited?.();
		settle(outcome);
	};

	let id: string;
	try {
		id = await runProgram(shell, args, root, undefined);
	} catch (error) {
		finish({ ok: false, code: null, lines: [describeError(error)] });
		return done;
	}
	runId = id;
	lines.push(...(pending.get(id) ?? []));
	pending.clear();
	const early = exits.get(id);
	if (early !== undefined) {
		finish({ ok: early === 0, code: early, lines });
	}
	return done;
}

/** The last few lines, so a failure names its cause instead of pointing at a wall of output. */
export function buildSummary(outcome: BuildOutcome): string {
	const tail = outcome.lines.slice(-TAIL).join("\n");
	if (tail !== "") return tail;
	return outcome.code === null ? "the command did not start" : `exit code ${outcome.code}`;
}

/**
 * Run the selected preset's build command before its launch, and report whether to go on.
 *
 * The presets are re-read here rather than threaded down from the panel: the file is local, it is the
 * same file the launch itself resolves from, and a preset edited since the panel last rendered is
 * then honoured instead of a stale copy.
 */
export async function runPresetBuild(options: {
	root: string;
	name: string;
	setError: (message: string | null) => void;
	setBuilding: (busy: boolean) => void;
}): Promise<boolean> {
	const { root, name, setError, setBuilding } = options;
	if (name === CARGO_DEFAULT) return true;
	let preset: LaunchPreset | undefined;
	try {
		const file: { configurations: LaunchPreset[] } = await readLaunchConfig(root);
		preset = file.configurations.find((entry) => entry.name === name);
	} catch (error) {
		setError(`Launch config: ${describeError(error)}`);
		return false;
	}
	const command = preset?.build?.trim() ?? "";
	if (command === "") return true;
	setBuilding(true);
	setError(null);
	try {
		const outcome = await runBuildCommand(root, command);
		if (!outcome.ok) {
			setError(`Build command failed: ${command}\n${buildSummary(outcome)}`);
			return false;
		}
		return true;
	} finally {
		setBuilding(false);
	}
}
