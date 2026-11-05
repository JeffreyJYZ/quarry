/** Launch-config and process-picker constants shared by the debugger's lib and its panels. */

/** Select value of the preset-free Cargo launch; no preset file is expected to define this name. */
export const CARGO_DEFAULT = "cargo:no-preset";

/** The label the Cargo entry carries in the select. */
export const CARGO_LABEL = "Cargo binary (no preset)";

/** The preset-free launch runs like a preset that does not stop on entry. */
export const CARGO_STOP_ON_ENTRY = false;

/** Every field a launch preset may carry, in the order the editor writes them. */
export const PRESET_FIELDS = [
	"name",
	"program",
	"args",
	"cwd",
	"build",
	"stopOnEntry",
	"initCommands",
] as const;

/** Rows the process picker renders at once; the filter is how the rest are reached. */
export const PROCESS_LIMIT = 50;
