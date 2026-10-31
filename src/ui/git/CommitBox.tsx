import { useEffect, useRef } from "react";
import "@/ui/git/git.css";

type CommitBoxProps = {
	message: string;
	onMessage: (value: string) => void;
	onRecall: (direction: "up" | "down") => void;
	commitError: string | null;
	committed: string | null;
	committing: boolean;
	stagedCount: number;
	commit: () => void;
	amendMode: boolean;
	amendMessage: string;
	amendError: string | null;
	amending: boolean;
	onBeginAmend: () => void;
	onAmendMessage: (value: string) => void;
	amend: () => void;
	onCancelAmend: () => void;
};

/** The commit message box, its Amend toggle and every status line they print. */
export default function CommitBox({
	message,
	onMessage,
	onRecall,
	commitError,
	committed,
	committing,
	stagedCount,
	commit,
	amendMode,
	amendMessage,
	amendError,
	amending,
	onBeginAmend,
	onAmendMessage,
	amend,
	onCancelAmend,
}: CommitBoxProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		// Keep the caret at the end after a recall replaces the value.
		const node = textareaRef.current;
		if (node === null || node.value !== message) return;
		const end = message.length;
		node.setSelectionRange(end, end);
	}, [message]);

	return (
		<div className="git-commit-box">
			<textarea
				ref={textareaRef}
				className="git-commit-input"
				rows={Math.min(5, Math.max(2, message.split("\\n").length))}
				placeholder="Commit message"
				value={message}
				onChange={(event) => onMessage(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.currentTarget.blur();
						return;
					}
					if (event.key === "ArrowUp" && event.currentTarget.selectionStart === 0) {
						event.preventDefault();
						onRecall("up");
						return;
					}
					if (
						event.key === "ArrowDown" &&
						event.currentTarget.selectionStart === event.currentTarget.value.length
					) {
						event.preventDefault();
						onRecall("down");
						return;
					}
					if (event.metaKey && !event.ctrlKey && !event.altKey && event.key === "Enter") {
						event.preventDefault();
						event.stopPropagation();
						commit();
					}
				}}
			/>
			<div className="git-commit-row">
				<button
					type="button"
					className="git-commit-btn"
					disabled={message.trim() === "" || stagedCount === 0 || committing}
					onClick={commit}
				>
					{committing ? "Committing…" : "Commit"}
				</button>
				<button
					type="button"
					className="git-stage-btn"
					disabled={amending || stagedCount === 0}
					title={stagedCount === 0 ? "Stage changes before amending" : undefined}
					onClick={onBeginAmend}
				>
					Amend
				</button>
				<span className="git-staged-count">{stagedCount} staged</span>
			</div>
			{amendMode ? (
				<>
					{stagedCount === 0 ? (
						<p className="git-amend-notice">
							Nothing is staged; amend would only rewrite the message.
						</p>
					) : null}
					<div className="git-commit-row">
						<input
							className="git-commit-input"
							value={amendMessage}
							onChange={(event) => onAmendMessage(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									onCancelAmend();
									return;
								}
								if (event.key === "Enter") {
									event.preventDefault();
									amend();
								}
							}}
						/>
						<button
							type="button"
							className="git-commit-btn"
							disabled={amendMessage.trim() === "" || amending || stagedCount === 0}
							onClick={amend}
						>
							{amending ? "Amending…" : "Amend commit"}
						</button>
						<button
							type="button"
							className="git-stage-btn"
							disabled={amending}
							onClick={onCancelAmend}
						>
							Cancel
						</button>
					</div>
				</>
			) : null}
			{amendError !== null ? <p className="git-commit-error">{amendError}</p> : null}
			{commitError !== null ? <p className="git-commit-error">{commitError}</p> : null}
			{committed !== null ? <p className="git-committed">Committed {committed}</p> : null}
		</div>
	);
}
