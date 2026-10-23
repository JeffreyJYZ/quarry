import type { GitStatusEntry } from "@/lib/project/api";
import { dirOf, nameOf, STATUS_CLASS, STATUS_LETTER } from "./labels";

type ChangeRowProps = {
	entry: GitStatusEntry;
	busy: Set<string>;
	selected: boolean;
	discarding: boolean;
	onOpen: (path: string) => void;
	onStage: (path: string) => void;
	onUnstage: (path: string) => void;
	onDiscard: (path: string) => void;
	onCopy: (path: string) => void;
	onDiff: (path: string) => void;
};

/** One row of the staged or changed list, with its stage/discard/copy/diff affordances. */
export function ChangeRow({
	entry,
	busy,
	selected,
	discarding,
	onOpen,
	onStage,
	onUnstage,
	onDiscard,
	onCopy,
	onDiff,
}: ChangeRowProps) {
	const isBusy = busy.has(entry.path);
	return (
		<li
			className={`git-row${isBusy ? " git-row-busy" : ""}${selected ? " git-row-selected" : ""}`}
		>
			<button
				type="button"
				className="git-row-main"
				onClick={() => onOpen(entry.path)}
				title={entry.path}
			>
				<span className={`git-status-letter ${STATUS_CLASS[entry.status]}`}>
					{STATUS_LETTER[entry.status]}
				</span>
				<span className="git-row-name">{nameOf(entry.path)}</span>
				<span className="git-row-dir">{dirOf(entry.path)}</span>
			</button>
			{entry.staged ? (
				// Staged rows offer no discard affordance: their content lives in the
				// index, so unstaging first is the honest path.
				<button
					type="button"
					className="git-stage-btn"
					disabled={isBusy}
					onClick={() => onUnstage(entry.path)}
					aria-label={`unstage ${entry.path}`}
				>
					Unstage
				</button>
			) : (
				<>
					<button
						type="button"
						className="git-discard-btn"
						disabled={isBusy || discarding}
						onClick={() => onDiscard(entry.path)}
						onKeyDown={(event) => {
							if (
								event.metaKey &&
								!event.ctrlKey &&
								!event.altKey &&
								event.key === "Backspace"
							) {
								event.preventDefault();
								onDiscard(entry.path);
							}
						}}
						aria-label={`discard ${entry.path}`}
					>
						Discard
					</button>
					<button
						type="button"
						className="git-stage-btn"
						disabled={isBusy}
						onClick={() => onStage(entry.path)}
						aria-label={`stage ${entry.path}`}
					>
						Stage
					</button>
				</>
			)}
			<button
				type="button"
				className="git-copy-btn"
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onCopy(entry.path);
				}}
				aria-label={`Copy path ${entry.path}`}
			>
				copy path
			</button>
			<button
				type="button"
				className="git-diff-btn"
				onClick={() => onDiff(entry.path)}
				aria-label={`diff ${entry.path}`}
			>
				diff
			</button>
		</li>
	);
}

type CopyHashButtonProps = {
	hash: string;
	onCopy: (text: string) => void;
};

/** The short-hash copy affordance shared by the history list and the blame groups. */
export function CopyHashButton({ hash, onCopy }: CopyHashButtonProps) {
	const short = hash.slice(0, 7);
	return (
		<button
			type="button"
			className="git-copy-btn"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onCopy(short);
			}}
			aria-label={`Copy hash ${short}`}
		>
			copy hash
		</button>
	);
}
