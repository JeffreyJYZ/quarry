import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Command = {
	id: string;
	label: string;
	hint?: string;
	disabled?: boolean;
	run: () => void;
};

export type CommandPaletteProps = {
	open: boolean;
	commands: Command[];
	recent: string[];
	onRecent: (ids: string[]) => void;
	onClose: () => void;
};

export default function CommandPalette({
	open,
	commands,
	recent,
	onRecent,
	onClose,
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setActive(0);
			return;
		}
		inputRef.current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [open, onClose]);

	const ordered = useMemo(() => {
		const recentSet = new Set(recent);
		const recentItems = recent
			.map((id) => commands.find((command) => command.id === id))
			.filter((command): command is Command => command !== undefined);
		const rest = commands.filter((command) => !recentSet.has(command.id));
		return [...recentItems, ...rest];
	}, [commands, recent]);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (needle === "") {
			return ordered;
		}
		return ordered.filter((command) => {
			const haystack = `${command.label} ${command.hint ?? ""}`.toLowerCase();
			return haystack.includes(needle);
		});
	}, [ordered, query]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset selection whenever the filter changes
	useEffect(() => {
		setActive(0);
	}, [query]);

	useEffect(() => {
		const host = listRef.current;
		if (host === null) {
			return;
		}
		host.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const move = useCallback(
		(step: number) => {
			if (filtered.length === 0) {
				return;
			}
			setActive((current) => (current + step + filtered.length) % filtered.length);
		},
		[filtered.length],
	);

	const runCommand = useCallback(
		(command: Command) => {
			if (command.disabled === true) {
				return;
			}
			onRecent([command.id, ...recent.filter((id) => id !== command.id)].slice(0, 8));
			onClose();
			window.setTimeout(() => {
				command.run();
			}, 0);
		},
		[onClose, onRecent, recent],
	);

	if (!open) {
		return null;
	}

	return (
		<div className="command-palette" role="dialog" aria-label="Command palette">
			<div className="command-head">
				<span className="label">commands</span>
				<input
					ref={inputRef}
					className="command-input"
					value={query}
					placeholder="type a command"
					aria-label="Command filter"
					spellCheck={false}
					autoComplete="off"
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							move(1);
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							move(-1);
							return;
						}
						if (event.key === "Enter") {
							event.preventDefault();
							const command = filtered[active];
							if (command !== undefined) {
								runCommand(command);
							}
						}
					}}
				/>
			</div>
			<div className="command-list" ref={listRef}>
				{filtered.map((command, index) => (
					<button
						type="button"
						key={command.id}
						className={
							command.disabled === true
								? "command-row disabled"
								: index === active
									? "command-row active"
									: "command-row"
						}
						data-index={index}
						disabled={command.disabled === true}
						onClick={() => runCommand(command)}
						onMouseEnter={() => setActive(index)}
					>
						<span className="command-label">{command.label}</span>
						{command.hint ? <span className="command-hint">{command.hint}</span> : null}
					</button>
				))}
				{filtered.length === 0 ? <p className="command-empty">No commands.</p> : null}
			</div>
			<div className="command-foot">
				<span>↑↓ move</span>
				<span>enter run</span>
				<span>esc close</span>
			</div>
		</div>
	);
}
