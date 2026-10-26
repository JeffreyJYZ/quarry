import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { splitPath } from "@/ui/projects/recentPaths";

export type ProjectSwitcherProps = {
	roots: string[];
	current: string | null;
	onSelectRoot: (root: string) => void;
	onOpenProject: () => void;
	onNewProject: () => void;
};

/**
 * The project name as a dropdown: the recent roots, searchable, plus the two ways to pick a new one.
 *
 * The open popover owns the keyboard: the search box takes focus, the arrows move the highlight and
 * Enter reopens the highlighted root. Escape and a click outside both close it.
 */
export default function ProjectSwitcher(props: ProjectSwitcherProps) {
	const { roots, current, onSelectRoot, onOpenProject, onNewProject } = props;
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (needle === "") return roots;
		return roots.filter((root) => root.toLowerCase().includes(needle));
	}, [roots, query]);

	const close = useCallback((refocus: boolean) => {
		setOpen(false);
		setQuery("");
		if (refocus) triggerRef.current?.focus();
	}, []);

	const choose = (root: string) => {
		close(true);
		onSelectRoot(root);
	};

	// The search box is the first thing a keyboard user wants.
	useEffect(() => {
		if (open) inputRef.current?.focus();
	}, [open]);

	// Keep the highlight on a row that still exists as the filter narrows.
	useEffect(() => {
		setActive((position) =>
			position < filtered.length ? position : Math.max(0, filtered.length - 1),
		);
	}, [filtered.length]);

	useEffect(() => {
		if (open) rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
	}, [open, active]);

	useEffect(() => {
		if (!open) return;
		const handlePointer = (event: MouseEvent) => {
			if (boxRef.current?.contains(event.target as Node) === true) return;
			close(true);
		};
		document.addEventListener("mousedown", handlePointer);
		return () => document.removeEventListener("mousedown", handlePointer);
	}, [open, close]);

	const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close(true);
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (filtered.length === 0) return;
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActive((position) => (position + step + filtered.length) % filtered.length);
			return;
		}
		if (event.key !== "Enter") return;
		const root = filtered[active];
		if (root === undefined) return;
		event.preventDefault();
		choose(root);
	};

	const label = current === null ? "Open project" : splitPath(current).name;

	return (
		<div className="project-switcher" ref={boxRef}>
			<button
				ref={triggerRef}
				type="button"
				className="project-switcher-trigger"
				aria-haspopup="dialog"
				aria-expanded={open}
				title={current ?? undefined}
				onClick={() => (open ? close(false) : setOpen(true))}
			>
				<span className="project-switcher-name">{label}</span>
				<span className="project-switcher-chevron" aria-hidden="true">
					▾
				</span>
			</button>
			{open ? (
				<div
					className="project-popover"
					role="dialog"
					aria-label="Projects"
					onKeyDown={handleKey}
				>
					<input
						ref={inputRef}
						className="project-search"
						type="text"
						value={query}
						placeholder="Search projects…"
						aria-label="Search projects"
						onChange={(event) => setQuery(event.target.value)}
					/>
					<p className="project-label">Recent Projects</p>
					{filtered.length === 0 ? (
						<p className="project-empty">No matching project</p>
					) : (
						<div className="project-list" role="listbox" aria-label="Recent projects">
							{filtered.map((root, index) => (
								<button
									key={root}
									type="button"
									role="option"
									aria-selected={index === active}
									className="project-row"
									title={root}
									ref={(node) => {
										rowRefs.current[index] = node;
									}}
									onMouseEnter={() => setActive(index)}
									onClick={() => choose(root)}
								>
									<span className="project-row-name">{splitPath(root).name}</span>
									{root === current ? (
										<span className="project-row-mark">current</span>
									) : null}
								</button>
							))}
						</div>
					)}
					<div className="project-actions">
						<button
							type="button"
							className="project-action"
							onClick={() => {
								close(false);
								onOpenProject();
							}}
						>
							Open project…
						</button>
						<button
							type="button"
							className="project-action"
							onClick={() => {
								close(false);
								onNewProject();
							}}
						>
							New project…
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
