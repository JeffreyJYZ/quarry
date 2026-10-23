import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { gitStage, gitUnstage } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type SetError = Dispatch<SetStateAction<string | null>>;

export type SetBusy = Dispatch<SetStateAction<Set<string>>>;

type ChangesOptions = {
	root: string;
	refreshToken: number;
	onRefresh: () => Promise<void>;
	onCommitDiff: (hash: string | null) => void;
};

/**
 * Owns the Changes tab's refresh, stage and unstage actions, the busy set they share with the
 * discard confirm, and the error line the branch menu also shows.
 */
export function useChanges({ root, refreshToken, onRefresh, onCommitDiff }: ChangesOptions) {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState<Set<string>>(() => new Set<string>());
	const [selected, setSelected] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);
	const copiedTimer = useRef<number | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			await onRefresh();
			setError(null);
		} catch (err) {
			setError(describeError(err));
		} finally {
			setLoading(false);
		}
		onCommitDiff(null);
	}, [onRefresh, onCommitDiff]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an explicit refresh trigger
	useEffect(() => {
		void refresh();
	}, [refreshToken]);

	const stage = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) return;
			setBusy((current) => {
				const next = new Set(current);
				for (const path of paths) next.add(path);
				return next;
			});
			setError(null);
			try {
				await gitStage(root, paths);
				await refresh();
			} catch (err) {
				setError(describeError(err));
			} finally {
				setBusy((current) => {
					const next = new Set(current);
					for (const path of paths) next.delete(path);
					return next;
				});
			}
		},
		[root, refresh],
	);

	const unstage = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) return;
			setBusy((current) => {
				const next = new Set(current);
				for (const path of paths) next.add(path);
				return next;
			});
			setError(null);
			try {
				await gitUnstage(root, paths);
				await refresh();
			} catch (err) {
				setError(describeError(err));
			} finally {
				setBusy((current) => {
					const next = new Set(current);
					for (const path of paths) next.delete(path);
					return next;
				});
			}
		},
		[root, refresh],
	);

	const copyText = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(text);
			if (copiedTimer.current !== null) {
				window.clearTimeout(copiedTimer.current);
			}
			copiedTimer.current = window.setTimeout(() => {
				copiedTimer.current = null;
				setCopied(null);
			}, 2000);
		} catch (err) {
			setError(describeError(err));
		}
	}, []);

	useEffect(() => {
		return () => {
			if (copiedTimer.current !== null) {
				window.clearTimeout(copiedTimer.current);
			}
		};
	}, []);

	return {
		error,
		setError,
		loading,
		busy,
		setBusy,
		selected,
		setSelected,
		copied,
		refresh,
		stage,
		unstage,
		copyText,
	};
}
