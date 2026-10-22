import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
	roots: string[];
	current: string | null;
	opening: boolean;
	onOpen: (root: string) => void;
};

function splitPath(path: string): { name: string; parent: string } {
	const trimmed = path.replace(/\/+$/, "");
	const index = trimmed.lastIndexOf("/");
	if (index <= 0) {
		return { name: trimmed, parent: "" };
	}
	return { name: trimmed.slice(index + 1), parent: trimmed.slice(0, index) };
}

export default function RecentProjects({ roots, current, opening, onOpen }: Props) {
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const handle = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (triggerRef.current?.contains(target) === true) return;
			if (listRef.current?.contains(target) === true) return;
			setOpen(false);
		};
		document.addEventListener("mousedown", handle);
		return () => document.removeEventListener("mousedown", handle);
	}, [open]);

	const close = useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	const openAt = useCallback(
		(index: number) => {
			const root = roots[index];
			if (root === undefined) return;
			setOpen(false);
			triggerRef.current?.focus();
			onOpen(root);
		},
		[roots, onOpen],
	);

	const handleTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			setHighlight(0);
			setOpen(true);
		}
	}, []);

	const handleListKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlight((current) => Math.min(current + 1, roots.length - 1));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlight((current) => Math.max(current - 1, 0));
			} else if (event.key === "Enter") {
				event.preventDefault();
				openAt(highlight);
			} else if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		},
		[roots.length, highlight, openAt, close],
	);

	if (roots.length === 0) {
		return null;
	}

	return (
		<div className="recent-projects">
			<button
				ref={triggerRef}
				type="button"
				className="button recent-trigger"
				aria-haspopup="listbox"
				aria-expanded={open}
				disabled={opening}
				onClick={() => {
					setHighlight(0);
					setOpen((current) => !current);
				}}
				onKeyDown={handleTriggerKeyDown}
			>
				▾
			</button>
			{open ? (
				<div
					ref={listRef}
					className="recent-list"
					role="listbox"
					tabIndex={-1}
					onKeyDown={handleListKeyDown}
				>
					{roots.map((root, index) => {
						const { name, parent } = splitPath(root);
						const isCurrent = root === current;
						return (
							<div
								key={root}
								role="option"
								tabIndex={-1}
								aria-selected={isCurrent}
								className={
									index === highlight ? "recent-item highlight" : "recent-item"
								}
								title={root}
								onClick={() => openAt(index)}
								onKeyDown={(event) => {
									if (event.key === "Enter") openAt(index);
								}}
								onMouseEnter={() => setHighlight(index)}
							>
								{isCurrent ? <span className="recent-dot">●</span> : null}
								<span className="recent-name">{name}</span>
								{parent ? <span className="recent-parent">{parent}</span> : null}
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
