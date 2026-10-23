import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PANEL_SIZES, type PanelName, resizePanel } from "@/lib/layout/model";
import {
	readProjectSettings,
	type ToolchainReport,
	toolchains,
	writeProjectSettings,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import {
	DEFAULT_PREFERENCES,
	DEFAULT_PROJECT_SETTINGS,
	effectivePreferences,
	normalizeProjectSettings,
	type Preferences,
	type ProjectSettings,
} from "@/lib/settings/model";
import type { BuildProfile } from "@/ui/app/shellShortcuts";

/**
 * Preferences and this project's overrides.
 *
 * The project file is the narrower layer: a value there wins over the user-wide one, which is why
 * every consumer reads `effective` rather than `preferences` directly.
 */
export function useSettings(options: {
	root: string | null;
	onNotice: (message: string) => void;
	onOpenSettings: () => void;
}) {
	const { root, onNotice, onOpenSettings } = options;
	const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
	const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null);
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const writeQueue = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		toolchains().then(
			(next) => setReport(next),
			() => setReport(null),
		);
	}, []);

	useEffect(() => {
		if (root === null) {
			setProjectSettings(null);
			return;
		}
		let cancelled = false;
		void readProjectSettings(root).then(
			(next) => {
				if (!cancelled) setProjectSettings(normalizeProjectSettings(next));
			},
			() => {
				if (!cancelled) setProjectSettings(null);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [root]);

	/** Writes run one after another so a burst of clicks cannot land out of order. */
	const handleProjectSettingsChange = useCallback(
		(next: ProjectSettings | null) => {
			setProjectSettings(next);
			if (root === null) return;
			writeQueue.current = writeQueue.current
				.then(() => writeProjectSettings(root, next ?? DEFAULT_PROJECT_SETTINGS))
				.catch((error: unknown) => onNotice(describeError(error)));
		},
		[root, onNotice],
	);

	/** A profile picked in the toolbar lands in the project's overrides when one is open. */
	const applyBuildProfile = useCallback(
		(profile: BuildProfile) => {
			if (root === null) {
				setPreferences((current) => ({ ...current, buildProfile: profile }));
				return;
			}
			handleProjectSettingsChange({
				...(projectSettings ?? DEFAULT_PROJECT_SETTINGS),
				buildProfile: profile,
			});
		},
		[root, handleProjectSettingsChange, projectSettings],
	);

	const handlePanelResize = useCallback((name: PanelName, px: number) => {
		setPreferences((current) => ({
			...current,
			panelSizes: resizePanel(current.panelSizes, name, px),
		}));
	}, []);

	const resetPanels = useCallback(() => {
		setPreferences((current) => ({ ...current, panelSizes: DEFAULT_PANEL_SIZES }));
	}, []);

	// Cmd+, opens the settings page from anywhere, including inside the editor.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
			if (event.key !== ",") return;
			event.preventDefault();
			onOpenSettings();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onOpenSettings]);

	const effective = effectivePreferences(preferences, projectSettings);

	return {
		preferences,
		setPreferences,
		projectSettings,
		handleProjectSettingsChange,
		applyBuildProfile,
		handlePanelResize,
		resetPanels,
		onNotice,
		report,
		effective,
		buildProfile: effective.buildProfile,
		panels: effective.panelSizes,
	};
}

export type SettingsModel = ReturnType<typeof useSettings>;
