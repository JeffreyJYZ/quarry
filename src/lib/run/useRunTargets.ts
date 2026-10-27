import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listRunTargets, type RunTarget } from "@/lib/project/api";
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
 * The targets a project can run, and which one the Run and Debug buttons act on.
 *
 * The listing carries a generation number: a project switch while the old project's `cargo
 * metadata` is still running must not land the previous project's targets under the new root.
 * A failed listing is not an error state — an empty dropdown beside a working editor is honest,
 * so the message rides along in `error` for whoever wants to show it.
 */
export function useRunTargets(root: string | null): {
	targets: RunTarget[];
	entries: TargetEntry[];
	selected: string | null;
	setSelected: (id: string | null) => void;
	refresh: () => Promise<void>;
	error: string | null;
} {
	const [targets, setTargets] = useState<RunTarget[]>([]);
	const [selected, setSelectedState] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const generation = useRef(0);

	const load = useCallback(async (nextRoot: string | null, mine: number) => {
		if (nextRoot === null) {
			if (generation.current !== mine) return;
			setTargets([]);
			setSelectedState(null);
			setError(null);
			return;
		}
		try {
			const listed = await listRunTargets(nextRoot);
			if (generation.current !== mine) return;
			setTargets(listed);
			setError(null);
			const preferred = preferredTargetId(listed, chosen.get(nextRoot) ?? null);
			if (preferred !== null) chosen.set(nextRoot, preferred);
			setSelectedState(preferred);
		} catch (reason) {
			if (generation.current !== mine) return;
			setTargets([]);
			setSelectedState(null);
			setError(describeError(reason));
		}
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

	const entries = useMemo(() => targetEntries(targets, []), [targets]);

	return { targets, entries, selected, setSelected, refresh, error };
}
