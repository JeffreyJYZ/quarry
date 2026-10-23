import { useCallback, useEffect, useRef, useState } from "react";
import { readSettings, writeSettings } from "@/lib/project/api";
import { removeRecentRoot } from "@/lib/projects/recent";

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
	const [items, setItems] = useState<string[]>(roots);
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setItems(roots);
	}, [roots]);

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

	const persist = useCallback(async (next: string[]) => {
		try {
			const settings = await readSettings();
			await writeSettings({ ...settings, recentRoots: next });
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		}
	}, []);

	const handleRemove = useCallback(
		async (event: React.MouseEvent, root: string) => {
			event.stopPropagation();
			event.preventDefault();
			const next = removeRecentRoot(items, root);
			setItems(next);
			await persist(next);
		},
		[items, persist],
	);

	const handleCopy = useCallback(async (event: React.MouseEvent, root: string) => {
		event.stopPropagation();
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(root);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		}
	}, []);

	const openAt = useCallback(
		(index: number) => {
			const root = items[index];
			if (root === undefined) return;
			setOpen(false);
			triggerRef.current?.focus();
			onOpen(root);
		},
		[items, onOpen],
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
				setHighlight((current) => Math.min(current + 1, items.length - 1));
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
		[items.length, highlight, openAt, close],
	);

	if (items.length === 0) {
		return (
			<div className="recent-projects">
				<span className="recent-empty">No recent projects</span>
			</div>
		);
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
					{items.map((root, index) => {
						const { name, parent } = splitPath(root);
						const isCurrent = root === current;
						return (
							<div key={root} className="recent-row">
								<div
									role="option"
									tabIndex={-1}
									aria-selected={isCurrent}
									className={
										index === highlight
											? "recent-item highlight"
											: "recent-item"
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
									{parent ? (
										<span className="recent-parent">{parent}</span>
									) : null}
								</div>
								<span className="recent-actions">
									<button
										type="button"
										className="recent-action"
										title="Copy path"
										aria-label={`copy path of ${name}`}
										onClick={(event) => void handleCopy(event, root)}
									>
										{"\u2398"}
									</button>
									<button
										type="button"
										className="recent-action"
										title="Remove"
										aria-label={`remove ${name} from recent projects`}
										onClick={(event) => void handleRemove(event, root)}
									>
										{"\u00D7"}
									</button>
								</span>
							</div>
						);
					})}
					{error ? <div className="recent-error">{error}</div> : null}
				</div>
			) : null}
		</div>
	);
}
