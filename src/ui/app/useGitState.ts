import { useCallback, useEffect, useRef, useState } from "react";
import { type GitStatus, gitBlame, gitStatus } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/**
 * Git state for the side rail and the editor's blame gutter.
 *
 * `refresh` coalesces: while a status read is in flight another request marks a follow-up and the
 * loop runs once more, so a burst of saves cannot interleave stale and fresh answers.
 */
export function useGitState(options: {
	root: string | null;
	activePath: string | null;
	onNotice?: (message: string) => void;
}) {
	const { root, activePath, onNotice } = options;
	const [status, setStatus] = useState<GitStatus | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);
	const [blameOn, setBlameOn] = useState(false);
	const [blameByPath, setBlameByPath] = useState<Map<string, { line: number; label: string }[]>>(
		new Map(),
	);
	const [blameSaveToken, setBlameSaveToken] = useState(0);

	const inFlight = useRef<Promise<void> | null>(null);
	const followup = useRef(false);
	const blameByPathRef = useRef(blameByPath);
	blameByPathRef.current = blameByPath;

	const refresh = useCallback(async () => {
		if (root === null) {
			setStatus(null);
			return;
		}
		if (inFlight.current !== null) {
			followup.current = true;
			return inFlight.current;
		}
		const run = async () => {
			do {
				followup.current = false;
				try {
					setStatus(await gitStatus(root));
				} catch (error) {
					onNotice?.(`git status failed: ${describeError(error)}`);
				}
			} while (followup.current);
		};
		const promise = run().finally(() => {
			inFlight.current = null;
		});
		inFlight.current = promise;
		return promise;
	}, [root, onNotice]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an explicit trigger
	useEffect(() => {
		void refresh().catch(() => {
			/* failures surface through callers that await refresh */
		});
	}, [root, refreshToken, refresh]);

	// Coming back to the window is a likely moment for the tree to have changed elsewhere.
	useEffect(() => {
		const onFocus = () => {
			if (root !== null) setRefreshToken((current) => current + 1);
		};
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [root]);

	// Blame is fetched only while the toggle is on, and cached per path.
	useEffect(() => {
		if (!blameOn || root === null || activePath === null) return;
		if (blameByPathRef.current.has(activePath)) return;
		let cancelled = false;
		gitBlame(root, activePath)
			.then((rows) => {
				if (cancelled) return;
				const annotations = rows.map((row) => ({
					line: row.line,
					label: `${row.hash} · ${row.author}`,
				}));
				setBlameByPath((current) => new Map(current).set(activePath, annotations));
			})
			.catch(() => {
				if (!cancelled) setBlameOn(false);
			});
		return () => {
			cancelled = true;
		};
	}, [blameOn, root, activePath]);

	const forgetBlame = useCallback((path: string) => {
		setBlameByPath((current) => {
			if (!current.has(path)) return current;
			const next = new Map(current);
			next.delete(path);
			return next;
		});
	}, []);

	return {
		status,
		refresh,
		refreshToken,
		setRefreshToken,
		blameOn,
		setBlameOn,
		blameByPath,
		blameSaveToken,
		markSaved: () => setBlameSaveToken((current) => current + 1),
		forgetBlame,
	};
}
