import { useRef, useState, type KeyboardEvent } from "react";
import { isTabActivation, rovingIndex } from "@/lib/tabs/roving";
import { type Session, tabLabel } from "@/lib/terminal/sessions";
import TabRename from "@/ui/terminal/TabRename";
import { TerminalIcon } from "@/ui/terminal/TerminalIcons";

export type TerminalTabsProps = {
	sessions: Session[];
	activeId: number | null;
	onSelect: (id: number) => void;
	onClose: (id: number) => void;
	updateSession: (id: number, updater: (s: Session) => Session) => void;
};

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Session tabs: one roving tab stop, arrows and Home/End walk the strip, Enter or Space activates.
 *
 * Keys typed into a rename field stay there; the row only takes them back when the field is gone.
 */
export default function TerminalTabs({
	sessions,
	activeId,
	onSelect,
	onClose,
	updateSession,
}: TerminalTabsProps) {
	const [editingId, setEditingId] = useState<number | null>(null);
	/** When a rename just closed, the second click of its double-click must not reopen it. */
	const closedAt = useRef(0);
	const rows = useRef<(HTMLDivElement | null)[]>([]);
	const selected = Math.max(
		0,
		sessions.findIndex((s) => s.id === activeId),
	);
	const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number, id: number) => {
		const target = event.target as HTMLElement | null;
		if (target !== null && EDITABLE.has(target.tagName)) return;
		const next = rovingIndex(event.key, index, sessions.length);
		if (next !== null) {
			const nextSession = sessions[next];
			if (nextSession === undefined) return;
			event.preventDefault();
			onSelect(nextSession.id);
			rows.current[next]?.focus();
			return;
		}
		if (!isTabActivation(event.key)) return;
		// Enter on the label or the close button is that button's own, not the tab's.
		if (event.target !== event.currentTarget) return;
		event.preventDefault();
		onSelect(id);
	};
	return (
		<div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
			{sessions.map((s, index) => {
				const label = tabLabel(s);
				const editing = editingId === s.id;
				return (
					<div
						key={s.id}
						ref={(node) => {
							rows.current[index] = node;
						}}
						className={`terminal-tab${s.id === activeId ? " active" : ""}${s.exited !== null ? " exited" : ""}`}
						role="tab"
						aria-selected={s.id === activeId}
						tabIndex={index === selected ? 0 : -1}
						title={`${s.cwd} · pid ${s.pid ?? "—"}`}
						onKeyDown={(event) => onRowKeyDown(event, index, s.id)}
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
									if (editingId === null && Date.now() - closedAt.current >= 300)
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
	);
}
