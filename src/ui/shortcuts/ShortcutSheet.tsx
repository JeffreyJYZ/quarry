import { useEffect, useRef } from "react";

export type ShortcutEntry = {
	keys: string[];
	action: string;
};

export type ShortcutGroup = {
	title: string;
	entries: ShortcutEntry[];
};

export type ShortcutSheetProps = {
	groups: ShortcutGroup[];
	onClose: () => void;
};

const GROUPS: ShortcutGroup[] = [
	{
		title: "Editor",
		entries: [
			{ keys: ["Cmd", "D"], action: "Select next occurrence" },
			{ keys: ["Cmd", "Shift", "L"], action: "Select all occurrences" },
			{ keys: ["Cmd", "U"], action: "Undo last occurrence selection" },
			{ keys: ["Cmd", "Shift", "["], action: "Fold at caret" },
			{ keys: ["Cmd", "Shift", "]"], action: "Unfold at caret" },
			{ keys: ["Cmd", "Alt", "["], action: "Fold all" },
			{ keys: ["Cmd", "Alt", "]"], action: "Unfold all" },
			{ keys: ["Cmd", "Alt", "1"], action: "Fold level 1" },
			{ keys: ["Cmd", "Alt", "2"], action: "Fold level 2" },
			{ keys: ["Cmd", "Alt", "3"], action: "Fold level 3" },
			{ keys: ["Cmd", "Shift", "\\"], action: "Jump to matching bracket" },
		],
	},
];

export default function ShortcutSheet({ groups, onClose }: ShortcutSheetProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mergedGroups: ShortcutGroup[] = groups.some((group) => group.title === "Editing")
		? groups.map((group) =>
				group.title === "Editing"
					? {
							...group,
							entries: [...group.entries, ...GROUPS.flatMap((g) => g.entries)],
						}
					: group,
			)
		: [...groups, ...GROUPS];
	const previousFocus = useRef<HTMLElement | null>(null);

	useEffect(() => {
		previousFocus.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		containerRef.current?.focus();
		return () => {
			previousFocus.current?.focus();
		};
	}, []);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	return (
		<button
			type="button"
			className="shortcut-backdrop"
			onClick={onClose}
			onKeyDown={(event) => {
				if (event.key === "Escape" || event.key === "Enter") {
					onClose();
				}
			}}
			aria-label="Close shortcuts"
			tabIndex={-1}
		>
			<div
				className="shortcut-sheet"
				role="dialog"
				aria-label="Keyboard shortcuts"
				tabIndex={-1}
				ref={containerRef}
				onClick={(event) => event.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="shortcut-head">
					<span className="label">shortcuts</span>
				</div>
				<div className="shortcut-body">
					{mergedGroups.map((group) => (
						<section className="shortcut-group" key={group.title}>
							<h2 className="shortcut-group-title">{group.title}</h2>
							<ul className="shortcut-list">
								{/* Two rows can name one action with different keys, so the keys are part of the id. */}
								{group.entries.map((entry) => (
									<li
										className="shortcut-row"
										key={`${entry.action}:${entry.keys.join("+")}`}
									>
										<span className="shortcut-keys">
											{entry.keys.map((key) => (
												<kbd
													className="shortcut-key"
													key={`${key}-${entry.keys.indexOf(key)}`}
												>
													{key}
												</kbd>
											))}
										</span>
										<span className="shortcut-action">{entry.action}</span>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</div>
		</button>
	);
}

export { GROUPS };
