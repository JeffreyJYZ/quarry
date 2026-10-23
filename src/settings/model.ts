/**
 * The settings model shared by the settings page and the rest of the shell.
 *
 * The Rust side clamps every value it reads, so this module is the second line of defence: it
 * normalises whatever arrived over IPC (or from a stale file) before any component sees it, and it
 * resolves a project's optional overrides against the user's preferences.
 */

import { clampPanelSizes, type PanelSizes } from "@/layout/model";

export type BuildProfile = "debug" | "release";
export type TabSize = 2 | 4 | 8;

export const TAB_SIZES: TabSize[] = [2, 4, 8];
export const BUILD_PROFILES: BuildProfile[] = ["debug", "release"];
export const FONT_SIZE_RANGE = { min: 9, max: 24 } as const;

export type Preferences = {
	editorFontSize: number;
	editorTabSize: TabSize;
	terminalFontSize: number;
	formatOnSave: boolean;
	buildProfile: BuildProfile;
	panelSizes: PanelSizes;
};

/** Per-project overrides; `null` means "inherit the user setting". */
export type ProjectSettings = {
	editorTabSize: TabSize | null;
	formatOnSave: boolean | null;
	buildProfile: BuildProfile | null;
};

export type EffectivePreferences = {
	editorFontSize: number;
	editorTabSize: TabSize;
	terminalFontSize: number;
	formatOnSave: boolean;
	buildProfile: BuildProfile;
	panelSizes: PanelSizes;
};

export const DEFAULT_PREFERENCES: Preferences = {
	editorFontSize: 13,
	editorTabSize: 4,
	terminalFontSize: 13,
	formatOnSave: false,
	buildProfile: "debug",
	panelSizes: clampPanelSizes(null),
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	editorTabSize: null,
	formatOnSave: null,
	buildProfile: null,
};

export function clampFontSize(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.round(Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, value)));
}

function readTabSize(value: unknown): TabSize | null {
	return value === 2 || value === 4 || value === 8 ? value : null;
}

function readBuildProfile(value: unknown): BuildProfile | null {
	return value === "debug" || value === "release" ? value : null;
}

export function normalizePreferences(input: unknown): Preferences {
	const source = (typeof input === "object" && input !== null ? input : {}) as Record<
		string,
		unknown
	>;
	return {
		editorFontSize: clampFontSize(source.editorFontSize, DEFAULT_PREFERENCES.editorFontSize),
		editorTabSize: readTabSize(source.editorTabSize) ?? DEFAULT_PREFERENCES.editorTabSize,
		terminalFontSize: clampFontSize(
			source.terminalFontSize,
			DEFAULT_PREFERENCES.terminalFontSize,
		),
		formatOnSave:
			typeof source.formatOnSave === "boolean"
				? source.formatOnSave
				: DEFAULT_PREFERENCES.formatOnSave,
		buildProfile: readBuildProfile(source.buildProfile) ?? DEFAULT_PREFERENCES.buildProfile,
		panelSizes: clampPanelSizes(source.panelSizes),
	};
}

export function normalizeProjectSettings(input: unknown): ProjectSettings {
	const source = (typeof input === "object" && input !== null ? input : {}) as Record<
		string,
		unknown
	>;
	return {
		editorTabSize: readTabSize(source.editorTabSize),
		formatOnSave: typeof source.formatOnSave === "boolean" ? source.formatOnSave : null,
		buildProfile: readBuildProfile(source.buildProfile),
	};
}

/** What the editor and the shell should use right now: the project's overrides, else the user's. */
export function effectivePreferences(
	user: Preferences,
	project: ProjectSettings | null,
): EffectivePreferences {
	return {
		editorFontSize: user.editorFontSize,
		editorTabSize: project?.editorTabSize ?? user.editorTabSize,
		terminalFontSize: user.terminalFontSize,
		formatOnSave: project?.formatOnSave ?? user.formatOnSave,
		buildProfile: project?.buildProfile ?? user.buildProfile,
		panelSizes: user.panelSizes,
	};
}

/** True when the project file holds nothing, so the page can offer to delete it. */
export function projectSettingsAreEmpty(settings: ProjectSettings): boolean {
	return (
		settings.editorTabSize === null &&
		settings.formatOnSave === null &&
		settings.buildProfile === null
	);
}
