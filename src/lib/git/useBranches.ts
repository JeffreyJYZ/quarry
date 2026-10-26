import { useCallback, useEffect, useRef, useState } from "react";
import { type Branch, gitBranches, gitCheckout, gitFileDiff } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { SetError } from "@/lib/git/useChanges";

type BranchesOptions = {
	root: string;
	setError: SetError;
	onRefresh: () => Promise<void>;
	loadHistory: (limit: number) => Promise<void>;
	historyLimit: number;
	diffPath: string | null;
	onDiff: (path: string | null) => void;
	onCommitDiff: (hash: string | null) => void;
};

/** Owns the branch menu: the list, its filter and the checkout that swaps branches. */
export function useBranches({
	root,
	setError,
	onRefresh,
	loadHistory,
	historyLimit,
	diffPath,
	onDiff,
	onCommitDiff,
}: BranchesOptions) {
	const [branches, setBranches] = useState<Branch[] | null>(null);
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState("");
	const [index, setIndex] = useState(0);
	const [switching, setSwitching] = useState(false);
	const [switched, setSwitched] = useState<string | null>(null);
	const [missingDiff, setMissingDiff] = useState<string | null>(null);
	const switchedTimer = useRef<number | null>(null);
	const filterRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await gitBranches(root);
				if (cancelled) return;
				setBranches(list);
			} catch {
				if (cancelled) return;
				setBranches([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [root]);

	const switchBranch = useCallback(
		async (branch: string) => {
			if (switching) return;
			setSwitching(true);
			setError(null);
			try {
				await gitCheckout(root, branch);
				await onRefresh();
				await loadHistory(historyLimit);
				setBranches(
					await gitBranches(root).catch((err) => {
						setError(`branch list refresh failed: ${describeError(err)}`);
						return branches ?? [];
					}),
				);
				setOpen(false);
				onCommitDiff(null);
				if (diffPath !== null) {
					try {
						await gitFileDiff(root, diffPath);
						onDiff(null);
						window.setTimeout(() => onDiff(diffPath), 0);
					} catch {
						onDiff(null);
						setMissingDiff("File not on this branch");
					}
				}
				setSwitched(`Switched to ${branch}`);
				if (switchedTimer.current !== null) {
					window.clearTimeout(switchedTimer.current);
				}
				switchedTimer.current = window.setTimeout(() => {
					switchedTimer.current = null;
					setSwitched(null);
				}, 4000);
			} catch (err) {
				setError(describeError(err));
			} finally {
				setSwitching(false);
			}
		},
		[
			root,
			onRefresh,
			switching,
			branches,
			diffPath,
			onDiff,
			loadHistory,
			historyLimit,
			onCommitDiff,
			setError,
		],
	);

	const changeFilter = useCallback((value: string) => {
		setFilter(value);
		setIndex(0);
	}, []);

	const clearMissingDiff = useCallback(() => {
		setMissingDiff(null);
	}, []);

	useEffect(() => {
		if (open) {
			setFilter("");
			setIndex(0);
			window.setTimeout(() => filterRef.current?.focus(), 0);
		}
	}, [open]);

	useEffect(() => {
		return () => {
			if (switchedTimer.current !== null) {
				window.clearTimeout(switchedTimer.current);
			}
		};
	}, []);

	return {
		branches,
		open,
		setOpen,
		filter,
		changeFilter,
		index,
		setIndex,
		switching,
		switched,
		missingDiff,
		clearMissingDiff,
		filterRef,
		switchBranch,
	};
}
