import type { LaunchPreset } from "@/project/api";
import { splitArgs } from "@/run/splitArgs";

export const PRESET_FIELDS = [
	"name",
	"program",
	"args",
	"cwd",
	"build",
	"stopOnEntry",
	"initCommands",
] as const;

/**
 * The editor's fields as the text controls hold them: `args` is one line, `initCommands` is one
 * command per line and `build` is a single line, so saving cannot drop either.
 * `initCommands` carries the `lldb_lookup.py` import that makes Rust `Vec`/`String` pretty-print.
 */
export type DraftPreset = {
	name: string;
	program: string;
	args: string;
	cwd: string;
	/** Build command; an empty string means the preset builds nothing first. */
	build: string;
	stopOnEntry: boolean;
	/** One init command per line; blank lines and surrounding space are dropped. */
	initCommands: string;
};

/** Quote only what would otherwise split or vanish, so the display round trips through `splitArgs`. */
function quoteArg(arg: string): string {
	return arg === "" || /\s/.test(arg) ? `"${arg}"` : arg;
}

/** The display inverse of `splitArgs`: an argv array as the editor's single args line. */
export function joinArgs(args: readonly string[]): string {
	return args.map(quoteArg).join(" ");
}

/** Init commands as the editor's textarea: one command per line. */
export function joinInitCommands(commands: readonly string[]): string {
	return commands.join("\n");
}

/** The display inverse of `joinInitCommands`: one element per non-empty line, trimmed. */
export function splitInitCommands(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

export function toDraftPreset(preset: LaunchPreset): DraftPreset {
	return {
		name: preset.name,
		program: preset.program ?? "",
		args: joinArgs(preset.args),
		cwd: preset.cwd ?? "",
		build: preset.build ?? "",
		stopOnEntry: preset.stopOnEntry,
		initCommands: joinInitCommands(preset.initCommands),
	};
}

export function toLaunchPreset(draft: DraftPreset): LaunchPreset {
	return {
		name: draft.name.trim(),
		program: draft.program.trim() === "" ? null : draft.program.trim(),
		args: splitArgs(draft.args),
		cwd: draft.cwd.trim() === "" ? null : draft.cwd.trim(),
		build: draft.build.trim() === "" ? null : draft.build.trim(),
		stopOnEntry: draft.stopOnEntry,
		initCommands: splitInitCommands(draft.initCommands),
	};
}

export function validatePreset(preset: { name: string; program: string | null }): string | null {
	if (preset.name.trim() === "") {
		return "Preset name is required";
	}
	if (preset.program !== null && preset.program.trim() === "") {
		return "Program is required when present";
	}
	return null;
}

export function validatePresets(names: readonly string[]): string | null {
	const seen = new Set<string>();
	for (const name of names) {
		const trimmed = name.trim();
		if (trimmed === "") {
			return "Preset name is required";
		}
		if (seen.has(trimmed)) {
			return `Duplicate preset name: ${trimmed}`;
		}
		seen.add(trimmed);
	}
	return null;
}

export function validateLaunchFile(file: {
	configurations: Array<Record<string, unknown>>;
}): string | null {
	for (const preset of file.configurations) {
		const keys = Object.keys(preset);
		for (const key of keys) {
			if (!(PRESET_FIELDS as readonly string[]).includes(key)) {
				return `Unknown field: ${key}`;
			}
		}
	}
	const names = file.configurations.map((preset) => String(preset.name ?? ""));
	const nameError = validatePresets(names);
	if (nameError !== null) {
		return nameError;
	}
	for (const preset of file.configurations) {
		if (preset.program !== null && preset.program !== undefined) {
			if (String(preset.program).trim() === "") {
				return "Program is required when present";
			}
		}
	}
	return null;
}
