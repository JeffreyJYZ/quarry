export const PRESET_FIELDS = [
	"name",
	"program",
	"args",
	"cwd",
	"build",
	"stopOnEntry",
	"initCommands",
] as const;

export type DraftPreset = {
	name: string;
	program: string;
	args: string;
	cwd: string;
	stopOnEntry: boolean;
};

export function splitArgs(input: string): string[] {
	return input
		.trim()
		.split(/\s+/)
		.filter((part) => part.length > 0);
}

export function joinArgs(args: readonly string[]): string {
	return args.join(" ");
}

export function toLaunchPreset(draft: DraftPreset) {
	return {
		name: draft.name.trim(),
		program: draft.program.trim() === "" ? null : draft.program.trim(),
		args: splitArgs(draft.args),
		cwd: draft.cwd.trim() === "" ? null : draft.cwd.trim(),
		build: null,
		stopOnEntry: draft.stopOnEntry,
		initCommands: [],
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
