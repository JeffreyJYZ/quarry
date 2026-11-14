import { invoke } from "@tauri-apps/api/core";
import type { Preferences, ProjectSettings } from "@/lib/settings/model";
import type { RunConfiguration, RunFormEntry } from "@/lib/project/api/run-configuration";

export type Settings = {
	lastRoot: string | null;
	openFiles: string[];
	activeFile: string | null;
	railCollapsed?: boolean;
	gitOpen?: boolean;
	dockTab?:
		"problems" | "bookmarks" | "tests" | "run" | "debugger" | "console" | "memory" | "todo";
	dockExpanded?: boolean | null;
	recentRoots?: string[];
	recentFiles?: string[];
	/** Directory the New project dialog last used. */
	newProjectParent?: string | null;
	runConfigurations?: RunConfiguration[];
	/** Each project's run form as it was last left, so a hand-set program survives a restart. */
	runForms?: RunFormEntry[];
	/** User-wide preferences; absent in a file written before the settings page existed. */
	preferences?: Preferences;
};

export type SettingsRead = {
	settings: Settings;
	/**
	 * Set when the file had to be repaired: a value was skipped, or the whole file was unusable and
	 * was kept as a `.bad` sibling. The read rejects in the second case.
	 */
	warning: string | null;
};

/**
 * The settings file, as the shell reads it: a plain snapshot, never the repair wrapper.
 *
 * The command answers the settings plus a warning. The warning goes to `onWarning`, which the shell
 * wires to its one notice channel, so the snapshot a caller works with keeps the shape every other
 * part of the shell already expects — including the restore that reopens each stored tab.
 */
export async function readSettings(onWarning?: (message: string) => void): Promise<Settings> {
	const read = await invoke<SettingsRead>("read_settings");
	if (read.warning !== null) onWarning?.(read.warning);
	return read.settings;
}

export function writeSettings(settings: Settings): Promise<void> {
	return invoke<void>("write_settings", { settings });
}

/**
 * Settings as they go back to disk: what the file already held first, this build's values on top.
 *
 * `readSettings` returns fields this build does not know because the Rust side flattens them into
 * its `extra` map, so spreading the value it returned keeps a newer build's settings intact instead
 * of dropping them on our next save.
 */
export function settingsForWrite(preserved: Record<string, unknown>, known: Settings): Settings {
	return { ...preserved, ...known };
}

export function rememberRoot(root: string): Promise<string[]> {
	return invoke<string[]>("remember_root", { root });
}

/** Per-project overrides from `<root>/.quarry/settings.json`; defaults when the file is absent. */
export function readProjectSettings(root: string): Promise<ProjectSettings> {
	return invoke<ProjectSettings>("read_project_settings", { root });
}

export function writeProjectSettings(root: string, settings: ProjectSettings): Promise<void> {
	return invoke<void>("write_project_settings", { root, settings });
}
