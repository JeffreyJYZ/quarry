import { useCallback, useEffect, useRef, useState } from "react";
import { type GitCommitEntry, gitAmend, gitCommit } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

type CommitOptions = {
	root: string;
	stagedCount: number;
	history: GitCommitEntry[] | null;
	historyLimit: number;
	refresh: () => Promise<void>;
	loadHistory: (limit: number) => Promise<void>;
	onDiff: (path: string | null) => void;
	onCommitDiff: (hash: string | null) => void;
};

/** Owns the commit message box, the amend row and the transient "Committed" line. */
export function useCommit({
	root,
	stagedCount,
	history,
	historyLimit,
	refresh,
	loadHistory,
	onDiff,
	onCommitDiff,
}: CommitOptions) {
	const [message, setMessage] = useState("");
	const [amendMode, setAmendMode] = useState(false);
	const [amendMessage, setAmendMessage] = useState("");
	const [amendError, setAmendError] = useState<string | null>(null);
	const [amending, setAmending] = useState(false);
	const [commitError, setCommitError] = useState<string | null>(null);
	const [committed, setCommitted] = useState<string | null>(null);
	const [committing, setCommitting] = useState(false);
	const committedTimer = useRef<number | null>(null);

	const commit = useCallback(async () => {
		const trimmed = message.trim();
		if (trimmed === "" || stagedCount === 0 || committing) return;
		setCommitting(true);
		setCommitError(null);
		try {
			const hash = await gitCommit(root, trimmed);
			setMessage("");
			setCommitted(hash);
			if (committedTimer.current !== null) {
				window.clearTimeout(committedTimer.current);
			}
			committedTimer.current = window.setTimeout(() => {
				committedTimer.current = null;
				setCommitted(null);
			}, 4000);
			await refresh();
			await loadHistory(historyLimit);
			onDiff(null);
			onCommitDiff(null);
		} catch (err) {
			setCommitError(describeError(err));
		} finally {
			setCommitting(false);
		}
	}, [
		message,
		stagedCount,
		committing,
		root,
		refresh,
		onDiff,
		onCommitDiff,
		loadHistory,
		historyLimit,
	]);

	const amend = useCallback(async () => {
		const trimmed = amendMessage.trim();
		if (trimmed === "" || amending) return;
		setAmending(true);
		setAmendError(null);
		try {
			const hash = await gitAmend(root, trimmed);
			setAmendMode(false);
			setAmendMessage("");
			setCommitted(hash);
			if (committedTimer.current !== null) {
				window.clearTimeout(committedTimer.current);
			}
			committedTimer.current = window.setTimeout(() => {
				committedTimer.current = null;
				setCommitted(null);
			}, 4000);
			await refresh();
			await loadHistory(historyLimit);
			onDiff(null);
			onCommitDiff(null);
		} catch (err) {
			setAmendError(describeError(err));
		} finally {
			setAmending(false);
		}
	}, [amendMessage, amending, root, refresh, loadHistory, historyLimit, onDiff, onCommitDiff]);

	const changeMessage = useCallback((value: string) => {
		setMessage(value);
		setCommitError(null);
	}, []);

	const beginAmend = useCallback(() => {
		setAmendMode(true);
		setAmendMessage(history !== null && history.length > 0 ? history[0].subject : message);
		setAmendError(null);
	}, [history, message]);

	const changeAmendMessage = useCallback((value: string) => {
		setAmendMessage(value);
		setAmendError(null);
	}, []);

	const cancelAmend = useCallback(() => {
		setAmendMode(false);
	}, []);

	useEffect(() => {
		return () => {
			if (committedTimer.current !== null) {
				window.clearTimeout(committedTimer.current);
			}
		};
	}, []);

	return {
		message,
		changeMessage,
		amendMode,
		amendMessage,
		amendError,
		amending,
		commitError,
		committed,
		committing,
		commit,
		amend,
		beginAmend,
		changeAmendMessage,
		cancelAmend,
	};
}
