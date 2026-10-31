import { useCallback, useEffect, useRef, useState } from "react";
import { type GitCommitEntry, gitAmend, gitCommit } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { readDraft, readHistory, rememberMessage, writeDraft, writeHistory } from "./commitHistory";

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
	const [message, setMessageState] = useState(() => readDraft(root));
	const [messageHistory, setMessageHistory] = useState<string[]>(() => readHistory(root));
	const [recallIndex, setRecallIndex] = useState(-1);
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
			const nextHistory = rememberMessage(messageHistory, trimmed);
			setMessageHistory(nextHistory);
			writeHistory(root, nextHistory);
			setMessageState("");
			writeDraft(root, "");
			setRecallIndex(-1);
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
		messageHistory,
	]);

	const amend = useCallback(async () => {
		const trimmed = amendMessage.trim();
		if (trimmed === "" || amending) return;
		if (stagedCount === 0) {
			setAmendError("Nothing is staged; amend needs staged changes.");
			return;
		}
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
	}, [
		amendMessage,
		amending,
		root,
		refresh,
		loadHistory,
		historyLimit,
		onDiff,
		onCommitDiff,
		stagedCount,
	]);

	const changeMessage = useCallback(
		(value: string) => {
			setMessageState(value);
			writeDraft(root, value);
			setRecallIndex(-1);
			setCommitError(null);
		},
		[root],
	);

	const recall = useCallback(
		(direction: "up" | "down") => {
			if (messageHistory.length === 0) return;
			let next = recallIndex;
			if (direction === "up") next = Math.min(recallIndex + 1, messageHistory.length - 1);
			else next = Math.max(recallIndex - 1, -1);
			setRecallIndex(next);
			const value =
				next === -1 ? "" : (messageHistory[messageHistory.length - 1 - next] ?? "");
			setMessageState(value);
			writeDraft(root, value);
		},
		[messageHistory, recallIndex, root],
	);

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
		recall,
		recallIndex,
		messageHistory,
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
