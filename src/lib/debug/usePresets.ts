import { useCallback, useEffect, useMemo } from "react";
import type { LaunchConfig, LaunchPreset, ProjectKind } from "@/lib/project/api";
import { CARGO_DEFAULT, CARGO_LABEL, type PresetEntry } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

/**
 * The launch select: its rows and which one is selected.
 *
 * A Cargo project always offers the preset-free entry first; a file's own presets follow. The
 * selection sticks to a rendered row, so a renamed preset never leaves an empty select.
 */
export function usePresets(options: {
	kind: ProjectKind | null;
	presets: LaunchPreset[];
	preset: string;
	setPresetState: Setter<string>;
	setResolved: Setter<LaunchConfig | null>;
	setBuildNeeded: Setter<string | null>;
}) {
	const { kind, presets, preset, setPresetState, setResolved, setBuildNeeded } = options;

	const setPreset = useCallback(
		(name: string) => {
			setResolved(null);
			setBuildNeeded(null);
			setPresetState(name);
		},
		[setBuildNeeded, setPresetState, setResolved],
	);

	const presetEntries = useMemo(() => {
		const entries: PresetEntry[] = [];
		if (kind === "cargo") entries.push({ value: CARGO_DEFAULT, label: CARGO_LABEL });
		for (const entry of presets) entries.push({ value: entry.name, label: entry.name });
		return entries;
	}, [kind, presets]);

	useEffect(() => {
		const values = presetEntries.map((entry) => entry.value);
		setPresetState((current) => {
			if (values.includes(current)) return current;
			return presets[0]?.name ?? values[0] ?? "";
		});
	}, [presetEntries, presets, setPresetState]);

	return { preset, setPreset, presetEntries };
}
