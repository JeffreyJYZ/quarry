import {
	decreaseFontSize,
	increaseFontSize,
	resetFontSize,
	scrollbackText,
} from "@/lib/terminal/fontSize";
import { describe, type Session, shortCwd } from "@/lib/terminal/sessions";

type HeaderProps = {
	root: string;
	sessions: Session[];
	active: Session | null;
	activeId: number | null;
	onSelect: (id: number) => void;
	onOpen: () => void;
	onClose: (id: number) => void;
	onRestart: () => void;
	updateSession: (id: number, updater: (s: Session) => Session) => void;
};

/** Tabs and the session toolbar. The grid size is fixed here because the PTY owns the real one. */
export default function TerminalHeader({
	root,
	sessions,
	active,
	activeId,
	onSelect,
	onOpen,
	onClose,
	onRestart,
	updateSession,
}: HeaderProps) {
	const size = { cols: 80, rows: 24 };

	return (
		<>
			<div className="terminal-tabs">
				{sessions.map((s) => (
					<div
						key={s.id}
						className={`terminal-tab${s.id === activeId ? " active" : ""}${s.exited !== null ? " exited" : ""}`}
						title={s.cwd}
					>
						<button
							type="button"
							className="terminal-tab-label"
							onClick={() => onSelect(s.id)}
						>
							<span>{shortCwd(s.cwd)}</span>
						</button>
						<button
							type="button"
							className="terminal-tab-close"
							aria-label={`close ${shortCwd(s.cwd)}`}
							onClick={() => onClose(s.id)}
						>
							×
						</button>
					</div>
				))}
				<button type="button" className="terminal-tab terminal-tab-add" onClick={onOpen}>
					+
				</button>
			</div>
			<div className="terminal-head">
				<span className="label">terminal</span>
				<span className="terminal-cwd" title={active !== null ? active.cwd : root}>
					{active !== null ? active.cwd : root}
				</span>
				{active !== null ? (
					<>
						<span className="terminal-size">
							{size.cols}x{size.rows}
						</span>
						<button
							type="button"
							className="terminal-btn"
							onClick={() =>
								updateSession(active.id, (s) => ({
									...s,
									fontSize: increaseFontSize(s.fontSize),
								}))
							}
						>
							A+
						</button>
						<button
							type="button"
							className="terminal-btn"
							onClick={() =>
								updateSession(active.id, (s) => ({
									...s,
									fontSize: decreaseFontSize(s.fontSize),
								}))
							}
						>
							A-
						</button>
						<button
							type="button"
							className="terminal-btn"
							onClick={() =>
								updateSession(active.id, (s) => ({
									...s,
									fontSize: resetFontSize(),
								}))
							}
						>
							A0
						</button>
						<button
							type="button"
							className="terminal-btn"
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
							Copy all
						</button>
						<button type="button" className="terminal-restart" onClick={onRestart}>
							Restart
						</button>
						{active.exited !== null ? (
							<span className="terminal-exit">exited {active.exited}</span>
						) : null}
					</>
				) : null}
			</div>
		</>
	);
}
