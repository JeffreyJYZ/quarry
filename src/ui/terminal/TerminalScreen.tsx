import type { Session } from "@/lib/terminal/sessions";
import { parseAnsi } from "@/lib/terminal/ansi";

type ScreenProps = {
	active: Session | null;
	displayed: string[];
	fontFamily: string;
	containerRef: React.RefObject<HTMLDivElement | null>;
	onScroll: () => void;
};

/** The scrollback itself: styled runs, the dropped-line marker, and the pid footer. */
export default function TerminalScreen({
	active,
	displayed,
	fontFamily,
	containerRef,
	onScroll,
}: ScreenProps) {
	if (active === null) return null;
	if (active.error !== null) return <div className="terminal-error">{active.error}</div>;

	return (
		<>
			<div ref={containerRef} className="terminal-body" onScroll={onScroll}>
				<pre
					className="terminal-pre"
					style={{
						fontSize: `${active.fontSize}px`,
						...(fontFamily === "" ? null : { fontFamily }),
					}}
				>
					{displayed.map((line, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a scrollback line has no identity beyond its position
						<span key={index} className="terminal-line">
							{parseAnsi(line).map((run, runIndex) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: runs are positional by nature
									key={runIndex}
									style={{
										color: run.fg ?? undefined,
										backgroundColor: run.bg ?? undefined,
										fontWeight: run.bold ? 600 : undefined,
										opacity: run.dim ? 0.7 : undefined,
										fontStyle: run.italic ? "italic" : undefined,
										textDecoration: run.underline ? "underline" : undefined,
									}}
								>
									{run.text}
								</span>
							))}
							{"\n"}
						</span>
					))}
				</pre>
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
