import { invoke } from "@tauri-apps/api/core";
import type { Preferences, ProjectSettings } from "@/lib/settings/model";
import type { RunConfiguration } from "@/lib/project/api/run-configuration";

export type Settings = {
	lastRoot: string | null;
	openFiles: string[];
	activeFile: string | null;
	railCollapsed?: boolean;
	gitOpen?: boolean;
	dockTab?: "problems" | "tests" | "run" | "debugger" | "console" | "memory";
	dockExpanded?: boolean | null;
	recentRoots?: string[];
	recentFiles?: string[];
	/** Directory the New project dialog last used. */
	newProjectParent?: string | null;
	runConfigurations?: RunConfiguration[];
	/** User-wide preferences; absent in a file written before the settings page existed. */
	preferences?: Preferences;
};

export function readSettings(): Promise<Settings> {
	return invoke<Settings>("read_settings");
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
