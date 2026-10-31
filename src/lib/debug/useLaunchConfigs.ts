import { useCallback } from "react";
import {
	type LaunchConfig,
	type LaunchPreset,
	defaultLaunchConfig,
	readLaunchConfig,
	resolveLaunchConfig,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { CARGO_DEFAULT, CARGO_STOP_ON_ENTRY } from "./sessionTypes";

/** Turning the launch select's value into a configuration, and keeping the preset list fresh. */
export function useLaunchConfigs({
	rootRef,
	setPresets,
	setConfigError,
}: {
	rootRef: { current: string | null };
	setPresets: (updater: LaunchPreset[] | ((current: LaunchPreset[]) => LaunchPreset[])) => void;
	setConfigError: (message: string | null) => void;
}) {
	/** The one place a select value becomes a configuration; a preset and Cargo differ. */
	const resolveConfig = useCallback(async (root: string, name: string): Promise<LaunchConfig> => {
		if (name === CARGO_DEFAULT) return defaultLaunchConfig(root, CARGO_STOP_ON_ENTRY);
		return resolveLaunchConfig(root, name);
	}, []);

	/** Re-read launch.json and keep the selection when the file still names it. */
	const refreshPresets = useCallback(async () => {
		const rootNow = rootRef.current;
		if (rootNow === null) return;
		try {
			const file: { configurations: LaunchPreset[] } = await readLaunchConfig(rootNow);
			setPresets(file.configurations);
		} catch (reason) {
			setConfigError(`Launch config: ${describeError(reason)}`);
		}
	}, [rootRef, setPresets, setConfigError]);

	return { resolveConfig, refreshPresets };
}
