import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { decreaseFontSize, increaseFontSize, scrollbackText } from "@/lib/terminal/fontSize";
import { describe, type Session, shortCwd, tabLabel } from "@/lib/terminal/sessions";
import TabRename from "@/ui/terminal/TabRename";
import {
	CopyIcon,
	FontDownIcon,
	FontUpIcon,
	PlusIcon,
	RestartIcon,
	TerminalIcon,
	TrashIcon,
} from "@/ui/terminal/TerminalIcons";
type HeaderProps = {
	sessions: Session[];
	active: Session | null;
	activeId: number | null;
	onSelect: (id: number) => void;
	onOpen: () => void;
	onClose: (id: number) => void;
	onRestart: () => void;
	updateSession: (id: number, updater: (s: Session) => Session) => void;
};
/** Icon-only action button: the label lives in `title` and `aria-label`, never on screen. */
function IconButton(props: {
	label: string;
	title: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className="terminal-icon-btn"
			title={props.title}
			aria-label={props.label}
			onClick={props.onClick}
		>
			{props.children}
		</button>
	);
}
/** One header row: session tabs on the left, terminal actions on the right. */
export default function TerminalHeader({
	sessions,
	active,
	activeId,
	onSelect,
	onOpen,
	onClose,
	onRestart,
	updateSession,
}: HeaderProps) {
	const [editingId, setEditingId] = useState<number | null>(null);
	const closedAt = useRef(0);
	return (
		<div className="terminal-chrome">
			<div
				className="terminal-tabs"
				role="tablist"
				aria-label="Terminal sessions"
				onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
					const index = sessions.findIndex((s) => s.id === activeId);
					if (index < 0) return;
					let next = index;
					if (event.key === "ArrowRight" || event.key === "ArrowDown")
						next = (index + 1) % sessions.length;
					else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
						next = (index - 1 + sessions.length) % sessions.length;
					else if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						return;
					} else return;
					if (next === index) return;
					event.preventDefault();
					onSelect(sessions[next].id);
				}}
			>
				{sessions.map((s) => {
					const label = tabLabel(s);
					const editing = editingId === s.id;
					return (
						<div
							key={s.id}
							className={`terminal-tab${s.id === activeId ? " active" : ""}${s.exited !== null ? " exited" : ""}`}
							role="tab"
							aria-selected={s.id === activeId}
							tabIndex={s.id === activeId ? 0 : -1}
							title={`${s.cwd} · pid ${s.pid ?? "—"}`}
						>
							<span className="terminal-tab-glyph">
								<TerminalIcon />
							</span>
							{editing ? (
								<TabRename
									value={label}
									session={s}
									updateSession={updateSession}
									onDone={() => {
										closedAt.current = Date.now();
										setEditingId(null);
									}}
								/>
							) : (
								<button
									type="button"
									className="terminal-tab-label"
									onClick={() => onSelect(s.id)}
									onDoubleClick={() => {
										if (
											editingId === null &&
											Date.now() - closedAt.current >= 300
										)
											setEditingId(s.id);
									}}
								>
									{label}
								</button>
							)}
							<button
								type="button"
								className="terminal-tab-close"
								aria-label={`Close ${label}`}
								onClick={() => onClose(s.id)}
							>
								×
							</button>
						</div>
					);
				})}
			</div>
			<div className="terminal-actions" role="toolbar" aria-label="Terminal actions">
				<IconButton label="New terminal" title="New terminal (⌘T)" onClick={onOpen}>
					<PlusIcon />
				</IconButton>
				{active === null ? null : (
					<>
						<IconButton
							label="Copy all scrollback"
							title="Copy all scrollback"
							onClick={() => {
								void navigator.clipboard
									.writeText(scrollbackText(active.lines))
									.catch((err) => {
										updateSession(active.id, (s) => ({
											...s,
											error: `Copy failed: ${describe(err)}`,
										}));
									});
							}}
						>
							<CopyIcon />
						</IconButton>
						<IconButton
							label="Restart terminal"
							title="Restart terminal"
							onClick={onRestart}
						>
							<RestartIcon />
						</IconButton>
						<IconButton
							label="Decrease font size"
							title={`Decrease font size (${active.fontSize}px)`}
							onClick={() =>
								updateSession(active.id, (s) => ({
									...s,
									fontSize: decreaseFontSize(s.fontSize),
								}))
							}
						>
							<FontDownIcon />
						</IconButton>
						<IconButton
							label="Increase font size"
							title={`Increase font size (${active.fontSize}px)`}
							onClick={() =>
								updateSession(active.id, (s) => ({
									...s,
									fontSize: increaseFontSize(s.fontSize),
								}))
							}
						>
							<FontUpIcon />
						</IconButton>
						<IconButton
							label={`Close ${shortCwd(active.cwd)}`}
							title="Close terminal (⌘W)"
							onClick={() => onClose(active.id)}
						>
							<TrashIcon />
						</IconButton>
					</>
				)}
			</div>
		</div>
	);
}
