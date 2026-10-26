import type { Session } from "@/lib/terminal/sessions";

type ScreenProps = {
	active: Session | null;
	/** The element xterm draws into; the fit addon measures this box. */
	hostRef: React.RefObject<HTMLDivElement | null>;
};

/** The terminal surface itself: xterm owns the grid, the strip below reports the shell. */
export default function TerminalScreen({ active, hostRef }: ScreenProps) {
	if (active === null) return null;
	if (active.error !== null) return <div className="terminal-error">{active.error}</div>;

	return (
		<>
			<div className="terminal-surface">
				<div ref={hostRef} className="terminal-body terminal-xterm" />
				{/* The shell's first prompt lands after the PTY answers, so say what the gap is. */}
				{active.opening ? <span className="terminal-starting">starting shell…</span> : null}
			</div>
			<div className="terminal-status">
				<span>pid {active.pid ?? "—"}</span>
				<span className="terminal-status-cwd" title={active.cwd}>
					{active.cwd}
				</span>
			</div>
		</>
	);
}
