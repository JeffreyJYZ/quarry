/** The settings defaults every install starts from, and the option lists the page offers. */

import { DEFAULT_TERMINAL_PREFERENCES } from "@/lib/consts/terminal";
import { DEFAULT_THEME_PREFERENCES } from "@/lib/consts/themes";
import { clampPanelSizes } from "@/lib/layout/model";
import type { BuildProfile, Preferences, ProjectSettings, TabSize } from "@/lib/settings/model";

export const TAB_SIZES: TabSize[] = [2, 4, 8];
export const BUILD_PROFILES: BuildProfile[] = ["debug", "release"];
export const FONT_SIZE_RANGE = { min: 9, max: 24 } as const;

export const DEFAULT_PREFERENCES: Preferences = {
	...DEFAULT_THEME_PREFERENCES,
	editorFontSize: 13,
	editorTabSize: 4,
	terminalFontSize: 13,
	...DEFAULT_TERMINAL_PREFERENCES,
	formatOnSave: false,
	buildProfile: "debug",
	terminalPlacement: "bottom",
	editorFontFamily: "",
	terminalFontFamily: "",
	rustAnalyzerPath: "",
	rustAnalyzerArgs: "",
	clangdPath: "",
	clangdArgs: "",
	panelSizes: clampPanelSizes(null),
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	editorTabSize: null,
	formatOnSave: null,
	buildProfile: null,
	cmakePreset: "",
	cmakeBuildDir: "",
	cmakeToolchainFile: "",
};
