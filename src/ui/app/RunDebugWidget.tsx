import type { RunDebug } from "@/ui/app/useRunDebug";
import "@/ui/app/runDebug.css";

/** A green triangle, the shape every IDE puts on Run. */
function RunIcon() {
	return (
		<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
			<path d="M1.6 0.9 L7.9 4.5 L1.6 8.1 Z" fill="currentColor" />
		</svg>
	);
}

/** A bug on a body, the shape every IDE puts on Debug. */
function DebugIcon() {
	return (
		<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
			<g fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round">
				<rect x="2.5" y="2.4" width="4" height="4.7" rx="2" />
				<path d="M3.4 2.4 V1.5 M5.6 2.4 V1.5 M2.5 4.1 H1.1 M2.6 6 H1.3 M6.5 4.1 H7.9 M6.4 6 H7.7" />
			</g>
		</svg>
	);
}

/** A filled square, the shape every IDE puts on Stop. */
function StopIcon() {
	return (
		<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
			<rect x="1.2" y="1.2" width="5.6" height="5.6" rx="0.8" fill="currentColor" />
		</svg>
	);
}

/**
 * The title bar's run widget: pick a target, press Run or Debug, stop what is running.
 *
 * It mirrors CLion's toolbar control — a configuration dropdown between two action buttons — so the
 * first thing a user reaches for is in the first place they look. Nothing here knows how a program
 * starts; `useRunDebug` does the building and the launching.
 */
export default function RunDebugWidget({
	runDebug,
	onEditConfigurations,
}: {
	runDebug: RunDebug;
	onEditConfigurations: () => void;
}) {
	const { entries, selected, canRun, busy, live } = runDebug;

	return (
		<div className="run-debug">
			<select
				className="run-debug-target"
				aria-label="Run configuration"
				value={selected ?? ""}
				disabled={entries.length === 0}
				onChange={(event) => runDebug.setSelected(event.target.value)}
			>
				{entries.length === 0 ? <option value="">no targets</option> : null}
				{entries.map((entry) => (
					<option key={entry.value} value={entry.value}>
						{entry.label}
					</option>
				))}
			</select>
			<button
				type="button"
				className="run-debug-action run-debug-run"
				title="Run (Shift+F10)"
				aria-label="Run"
				disabled={!canRun || live || busy}
				onClick={runDebug.run}
			>
				<RunIcon />
			</button>
			<button
				type="button"
				className="run-debug-action run-debug-debug"
				title="Debug (Shift+F9)"
				aria-label="Debug"
				disabled={!canRun || live || busy}
				onClick={runDebug.debugNow}
			>
				<DebugIcon />
			</button>
			<button
				type="button"
				className="run-debug-action run-debug-stop"
				title="Stop (Cmd+F2)"
				aria-label="Stop"
				disabled={!live}
				onClick={runDebug.stop}
			>
				<StopIcon />
			</button>
			<button
				type="button"
				className="run-debug-edit"
				title="Edit run configurations"
				aria-label="Edit run configurations"
				onClick={onEditConfigurations}
			>
				···
			</button>
		</div>
	);
}
