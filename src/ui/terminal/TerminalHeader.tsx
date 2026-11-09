import type { ReactNode } from "react";
import { decreaseFontSize, increaseFontSize, scrollbackText } from "@/lib/terminal/fontSize";
import { describe, type Session, shortCwd } from "@/lib/terminal/sessions";
import TerminalTabs from "@/ui/terminal/TerminalTabs";
import {
	CopyIcon,
	FontDownIcon,
	FontUpIcon,
	PlusIcon,
	RestartIcon,
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
	return (
		<div className="terminal-chrome">
			<TerminalTabs
				sessions={sessions}
				activeId={activeId}
				onSelect={onSelect}
				onClose={onClose}
				updateSession={updateSession}
			/>
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
