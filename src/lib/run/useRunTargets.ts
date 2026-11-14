import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type LaunchPreset,
	listRunTargets,
	readLaunchConfig,
	type RunTarget,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { preferredTargetId, targetEntries, type TargetEntry } from "@/lib/run/targets";

/**
 * The chosen target per project root, for this run of the app.
 *
 * `Settings` has no field for it, and inventing one would add a schema the settings page never
 * edits; a project the user comes back to in the same session keeps its target, and a restart
 * falls back to the preferred one.
 */
const chosen = new Map<string, string>();

/**
 * The targets and presets a project can run, and which one the Run and Debug buttons act on.
 *
 * A detected target and a `.quarry/launch.json` preset both name something to launch, so both are
 * rows here: without the presets a hand-set program has nothing to select, and the Run button beside
 * the dropdown cannot be pointed at it. The two resolve through different commands, which is why
 * `isPreset` is part of what this hook answers.
 *
 * The listing carries a generation number: a project switch while the old project's `cargo
 * metadata` is still running must not land the previous project's targets under the new root.
 * A failed target listing is not an error state — an empty dropdown beside a working editor is
 * honest, so the message rides along in `error` for whoever wants to show it. A malformed launch
 * file is the Debugger panel's to report; here it leaves the presets empty rather than hiding the
 * targets that were detected.
 */
export function useRunTargets(root: string | null): {
	targets: RunTarget[];
	presets: LaunchPreset[];
	entries: TargetEntry[];
	selected: string | null;
	setSelected: (id: string | null) => void;
	/** True when the id names a preset, and no detected target already claims that id. */
	isPreset: (id: string) => boolean;
	refresh: () => Promise<void>;
	error: string | null;
} {
	const [targets, setTargets] = useState<RunTarget[]>([]);
	const [presets, setPresets] = useState<LaunchPreset[]>([]);
	const [selected, setSelectedState] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const generation = useRef(0);

	const load = useCallback(async (nextRoot: string | null, mine: number) => {
		if (nextRoot === null) {
			if (generation.current !== mine) return;
			setTargets([]);
			setPresets([]);
			setSelectedState(null);
			setError(null);
			return;
		}
		let listed: RunTarget[] = [];
		let failure: string | null = null;
		try {
			listed = await listRunTargets(nextRoot);
		} catch (reason) {
			failure = describeError(reason);
		}
		let file: LaunchPreset[] = [];
		try {
			file = (await readLaunchConfig(nextRoot)).configurations;
		} catch {
			// The debugger reports a launch file it cannot read; the dropdown still lists targets.
			file = [];
		}
		if (generation.current !== mine) return;
		setTargets(listed);
		setPresets(file);
		setError(failure);
		const preferred = preferredTargetId(listed, chosen.get(nextRoot) ?? null, file);
		if (preferred !== null) chosen.set(nextRoot, preferred);
		setSelectedState(preferred);
	}, []);

	useEffect(() => {
		const mine = ++generation.current;
		void load(root, mine);
		return () => {
			generation.current += 1;
		};
	}, [root, load]);

	const refresh = useCallback(async () => {
		const mine = ++generation.current;
		await load(root, mine);
	}, [root, load]);

	const setSelected = useCallback(
		(id: string | null) => {
			setSelectedState(id);
			if (root === null) return;
			if (id === null) chosen.delete(root);
			else chosen.set(root, id);
		},
		[root],
	);

	const presetNames = useMemo(() => new Set(presets.map((preset) => preset.name)), [presets]);
	const targetIds = useMemo(() => new Set(targets.map((target) => target.id)), [targets]);
	const isPreset = useCallback(
		(id: string) => presetNames.has(id) && !targetIds.has(id),
		[presetNames, targetIds],
	);

	const entries = useMemo(() => targetEntries(targets, presets), [targets, presets]);

	return { targets, presets, entries, selected, setSelected, isPreset, refresh, error };
}
