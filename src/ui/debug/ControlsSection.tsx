import type { DebugController } from "@/lib/debug/session";

/** Transport controls: continue, run to cursor, the three steps, stop and restart. */
export default function ControlsSection({
	debug,
	activePath,
	cursor,
}: {
	debug: DebugController;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
}) {
	const stopped = debug.status === "stopped";

	return (
		<section className="debug-section">
			<div className="debug-section-head">
				<span className="label">controls</span>
			</div>
			<div className="debug-controls">
				<button
					type="button"
					className="button"
					disabled={!stopped}
					onClick={debug.continueRun}
				>
					Continue
				</button>
				<button
					type="button"
					className="button"
					disabled={debug.sessionId === null || activePath === null || cursor === null}
					onClick={() => {
						if (activePath !== null && cursor !== null) {
							debug.runToCursor(activePath, cursor.line + 1);
						}
					}}
				>
					Run to cursor
				</button>
				<button
					type="button"
					className="button"
					disabled={!stopped}
					onClick={() => debug.step("next")}
				>
					Next
				</button>
				<button
					type="button"
					className="button"
					disabled={!stopped}
					onClick={() => debug.step("stepIn")}
				>
					Step in
				</button>
				<button
					type="button"
					className="button"
					disabled={!stopped}
					onClick={() => debug.step("stepOut")}
				>
					Step out
				</button>
				<button
					type="button"
					className="button"
					disabled={debug.sessionId === null}
					onClick={debug.stop}
				>
					Stop
				</button>
				<button
					type="button"
					className="button"
					disabled={debug.sessionId === null || debug.restarting}
					onClick={debug.restart}
				>
					{debug.restarting ? "Restarting…" : "Restart"}
				</button>
			</div>
		</section>
	);
}
