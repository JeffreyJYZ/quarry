/**
 * The settings model shared by the settings page and the rest of the shell.
 *
 * The Rust side clamps every value it reads, so this module is the second line of defence: it
 * normalises whatever arrived over IPC (or from a stale file) before any component sees it, and it
 * resolves a project's optional overrides against the user's preferences.
 */

import { DEFAULT_PREFERENCES, FONT_SIZE_RANGE } from "@/lib/consts/settings";
import { clampPanelSizes, type PanelSizes } from "@/lib/layout/model";
import type { TerminalCursorStyle } from "@/lib/settings/terminal";
import {
	DEFAULT_TERMINAL_PREFERENCES,
	effectiveTerminalPreferences,
	normalizeTerminalPreferences,
} from "@/lib/settings/terminal";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "@/lib/consts/terminal";
import { normalizeThemePreferences, type ThemePreferences } from "@/lib/themes/preferences";

/**
 * The terminal panel has its own size range (9-20), tighter than the editor's (9-24). Clamping it
 * through the editor range let Settings store 24 while the panel rendered 20 — the control lied.
 */
function clampTerminalFontSize(value: unknown, fallback: number): number {
	const number = typeof value === "number" ? value : Number.NaN;
	if (!Number.isFinite(number)) return fallback;
	return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, number));
}

export type BuildProfile = "debug" | "release";
export type TerminalPlacement = "bottom" | "right";
export type TabSize = 2 | 4 | 8;

export {
	BUILD_PROFILES,
	DEFAULT_PREFERENCES,
	DEFAULT_PROJECT_SETTINGS,
	FONT_SIZE_RANGE,
	TAB_SIZES,
} from "@/lib/consts/settings";

/** `theme` and `customThemes` are optional on disk, so an old settings file still loads. */
export type Preferences = ThemePreferences & {
	editorFontSize: number;
	editorTabSize: TabSize;
	terminalFontSize: number;
	terminalLineHeight: number;
	terminalCursorStyle: TerminalCursorStyle;
	terminalCursorBlink: boolean;
	terminalScrollback: number;
	terminalLetterSpacing: number;
	formatOnSave: boolean;
	buildProfile: BuildProfile;
	terminalPlacement: TerminalPlacement;
	/** Font families; empty means the built-in stack. */
	editorFontFamily: string;
	terminalFontFamily: string;
	/** Language-server overrides; empty path means discovery. */
	rustAnalyzerPath: string;
	rustAnalyzerArgs: string;
	clangdPath: string;
	clangdArgs: string;
	panelSizes: PanelSizes;
};

/** Per-project overrides; `null` means "inherit the user setting". */
export type ProjectSettings = {
	editorTabSize: TabSize | null;
	formatOnSave: boolean | null;
	buildProfile: BuildProfile | null;
	/** CMake configure preset name; empty picks the project's only visible preset. */
	cmakePreset: string;
	/** CMake build directory; empty detects the configured tree, then `<root>/build`. */
	cmakeBuildDir: string;
	/** CMake toolchain file; empty keeps the preset's own `CMAKE_TOOLCHAIN_FILE`. */
	cmakeToolchainFile: string;
};

export type EffectivePreferences = Preferences;

export function clampFontSize(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.round(Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, value)));
}

function readTabSize(value: unknown): TabSize | null {
	return value === 2 || value === 4 || value === 8 ? value : null;
}

function readPlacement(value: unknown): TerminalPlacement {
	return value === "right" ? "right" : "bottom";
}

function readBuildProfile(value: unknown): BuildProfile | null {
	return value === "debug" || value === "release" ? value : null;
}

function readText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * A normalised value, plus every key the input carried that this build does not know.
 *
 * The Rust side keeps those in its `extra` map so another build's preference is not deleted on the
 * next save; the same has to hold here, because the shell writes back the object it normalised and
 * a key dropped now never reaches the file again.
 */
function withUnknownKeys<T extends object>(known: T, source: Record<string, unknown>): T {
	const extras: Record<string, unknown> = {};
	for (const key of Object.keys(source)) {
		if (!(key in known)) extras[key] = source[key];
	}
	return { ...extras, ...known } as T;
}

export function normalizePreferences(input: unknown): Preferences {
	const source = (typeof input === "object" && input !== null ? input : {}) as Record<
		string,
		unknown
	>;
	const known: Preferences = {
		...normalizeThemePreferences(source),
		editorFontSize: clampFontSize(source.editorFontSize, DEFAULT_PREFERENCES.editorFontSize),
		editorTabSize: readTabSize(source.editorTabSize) ?? DEFAULT_PREFERENCES.editorTabSize,
		terminalFontSize: clampTerminalFontSize(
			source.terminalFontSize,
			DEFAULT_PREFERENCES.terminalFontSize,
		),
		...normalizeTerminalPreferences(source, DEFAULT_TERMINAL_PREFERENCES),
		formatOnSave:
			typeof source.formatOnSave === "boolean"
				? source.formatOnSave
				: DEFAULT_PREFERENCES.formatOnSave,
		buildProfile: readBuildProfile(source.buildProfile) ?? DEFAULT_PREFERENCES.buildProfile,
		terminalPlacement: readPlacement(source.terminalPlacement),
		editorFontFamily: readText(source.editorFontFamily),
		terminalFontFamily: readText(source.terminalFontFamily),
		rustAnalyzerPath: readText(source.rustAnalyzerPath),
		rustAnalyzerArgs: readText(source.rustAnalyzerArgs),
		clangdPath: readText(source.clangdPath),
		clangdArgs: readText(source.clangdArgs),
		panelSizes: clampPanelSizes(source.panelSizes),
	};
	return withUnknownKeys(known, source);
}

export function normalizeProjectSettings(input: unknown): ProjectSettings {
	const source = (typeof input === "object" && input !== null ? input : {}) as Record<
		string,
		unknown
	>;
	const known: ProjectSettings = {
		editorTabSize: readTabSize(source.editorTabSize),
		formatOnSave: typeof source.formatOnSave === "boolean" ? source.formatOnSave : null,
		buildProfile: readBuildProfile(source.buildProfile),
		cmakePreset: readText(source.cmakePreset),
		cmakeBuildDir: readText(source.cmakeBuildDir),
		cmakeToolchainFile: readText(source.cmakeToolchainFile),
	};
	return withUnknownKeys(known, source);
}

/** What the editor and the shell should use right now: the project's overrides, else the user's. */
export function effectivePreferences(
	user: Preferences,
	project: ProjectSettings | null,
): EffectivePreferences {
	return {
		...user,
		editorTabSize: project?.editorTabSize ?? user.editorTabSize,
		...effectiveTerminalPreferences(user),
		formatOnSave: project?.formatOnSave ?? user.formatOnSave,
		buildProfile: project?.buildProfile ?? user.buildProfile,
	};
}

/** True when the project file holds nothing, so the page can offer to delete it. */
export function projectSettingsAreEmpty(settings: ProjectSettings): boolean {
	return (
		settings.editorTabSize === null &&
		settings.formatOnSave === null &&
		settings.buildProfile === null &&
		settings.cmakePreset === "" &&
		settings.cmakeBuildDir === "" &&
		settings.cmakeToolchainFile === ""
	);
}
