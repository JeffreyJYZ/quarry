type CommitBoxProps = {
	message: string;
	onMessage: (value: string) => void;
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
	return (
		<div className="git-commit-box">
			<textarea
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
					disabled={amending}
					onClick={onBeginAmend}
				>
					Amend
				</button>
				<span className="git-staged-count">{stagedCount} staged</span>
			</div>
			{amendMode ? (
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
						disabled={amendMessage.trim() === "" || amending}
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
			) : null}
			{amendError !== null ? <p className="git-commit-error">{amendError}</p> : null}
			{commitError !== null ? <p className="git-commit-error">{commitError}</p> : null}
			{committed !== null ? <p className="git-committed">Committed {committed}</p> : null}
		</div>
	);
}
