import { isAbsoluteRunPath } from "@/lib/run/cwd";
import type { RunControls } from "@/ui/app/runControlsTypes";
import RunForm from "@/ui/run/RunForm";
import RunLog from "@/ui/run/RunLog";

/**
 * The dock's Run tab: the process's output, and the configuration form behind a toggle.
 *
 * The form keeps every field it always had, so program, args, cwd, env and the saved
 * configurations are still editable here; the log takes whatever height is left.
 */
export default function RunDock({ runs }: { runs: RunControls }) {
	const running = runs.running !== null;
	const showLog = running || runs.lines.length > 0 || runs.exited !== null;
	const showEmpty = !showLog && !runs.panelOpen;

	return (
		<div className="run-dock">
			<div className="run-dock-bar">
				<button
					type="button"
					className={runs.panelOpen ? "dock-action active" : "dock-action"}
					aria-expanded={runs.panelOpen}
					onClick={runs.panelOpen ? runs.closePanel : runs.openPanel}
				>
					Configure
				</button>
			</div>
			{runs.panelOpen ? (
				<RunForm
					program={runs.program}
					args={runs.args}
					cwd={runs.cwd}
					argv={runs.argv}
					cwdError={
						runs.cwd !== "" && !isAbsoluteRunPath(runs.cwd)
							? "cwd must be absolute"
							: null
					}
					running={running}
					env={runs.env}
					configurations={runs.configurations}
					selectedConfiguration={runs.selected}
					onProgramChange={runs.setProgram}
					onArgsChange={runs.setArgs}
					onCwdChange={runs.setCwd}
					onEnvChange={runs.setEnv}
					onSelectConfiguration={runs.select}
					onSaveConfiguration={runs.save}
					onUpdateConfiguration={runs.update}
					onDeleteConfiguration={runs.remove}
					onRun={() => void runs.run()}
					onStop={() => void runs.stop()}
					onClose={runs.closePanel}
				/>
			) : null}
			{showLog ? (
				<RunLog
					lines={runs.lines}
					exited={runs.exited}
					argv={runs.argv}
					running={running}
					onRerun={() => void runs.run()}
					onClear={runs.clearLog}
				/>
			) : null}
			{showEmpty ? (
				<p className="run-dock-empty">No run yet. Press Run in the title bar.</p>
			) : null}
		</div>
	);
}
