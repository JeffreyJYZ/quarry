import { useCallback, useState } from "react";
import { gitDiscard } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { SetBusy, SetError } from "@/lib/git/useChanges";

type DiscardOptions = {
	root: string;
	diffPath: string | null;
	onDiff: (path: string | null) => void;
	refresh: () => Promise<void>;
	setBusy: SetBusy;
	setError: SetError;
};

/** Owns the discard confirmation and the `gitDiscard` call behind it. */
export function useDiscard({ root, diffPath, onDiff, refresh, setBusy, setError }: DiscardOptions) {
	const [paths, setPaths] = useState<string[] | null>(null);
	const [discarding, setDiscarding] = useState(false);

	const discard = useCallback(
		async (targets: string[]) => {
			if (targets.length === 0) return;
			setDiscarding(true);
			setBusy((current) => {
				const next = new Set(current);
				for (const path of targets) next.add(path);
				return next;
			});
			setError(null);
			try {
				await gitDiscard(root, targets);
				if (diffPath !== null && targets.includes(diffPath)) {
					onDiff(null);
				}
				await refresh();
				setPaths(null);
			} catch (err) {
				setError(describeError(err));
			} finally {
				setDiscarding(false);
				setBusy((current) => {
					const next = new Set(current);
					for (const path of targets) next.delete(path);
					return next;
				});
			}
		},
		[root, refresh, diffPath, onDiff, setBusy, setError],
	);

	return { paths, setPaths, discarding, discard };
}
