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

const GROUPS: ShortcutGroup[] = [];

export default function ShortcutSheet({ groups, onClose }: ShortcutSheetProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
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
					{groups.map((group) => (
						<section className="shortcut-group" key={group.title}>
							<h2 className="shortcut-group-title">{group.title}</h2>
							<ul className="shortcut-list">
								{group.entries.map((entry) => (
									<li className="shortcut-row" key={entry.action}>
										<span className="shortcut-keys">
											{entry.keys.map((key) => (
												<kbd className="shortcut-key" key={key}>
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
