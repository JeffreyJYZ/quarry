import ProcessPicker from "@/ui/debug/ProcessPicker";
import type { DebugController } from "@/lib/debug/session";

/** How many characters of a program path the panel keeps when it truncates from the left. */
const PROGRAM_CHARS = 36;

/** The path tail is what identifies the binary, so the head is what goes when space runs out. */
function truncateLeft(path: string): string {
	if (path.length <= PROGRAM_CHARS) {
		return path;
	}
	return `…${path.slice(path.length - (PROGRAM_CHARS - 1))}`;
}

/** Preset picker, launch and attach controls, and the notes for the resolved configuration. */
export default function LaunchSection({
	debug,
	onEditPresets,
}: {
	debug: DebugController;
	onEditPresets: () => void;
}) {
	const session = debug.sessionId;

	return (
		<section className="debug-section">
			<div className="debug-section-head">
				<span className="label">launch</span>
				<span className="debug-count">{debug.presetEntries.length}</span>
			</div>
			<div className="debug-row">
				<select
					className="debug-select"
					value={debug.preset}
					disabled={debug.presetEntries.length === 0 || session !== null}
					onChange={(event) => debug.setPreset(event.target.value)}
				>
					{debug.presetEntries.length === 0 ? (
						<option value="">no presets</option>
					) : (
						debug.presetEntries.map((entry) => (
							<option key={entry.value} value={entry.value}>
								{entry.label}
							</option>
						))
					)}
				</select>
				<button
					type="button"
					className="button"
					disabled={
						debug.status === "launching" ||
						session !== null ||
						debug.preset === "" ||
						debug.presetEntries.length === 0
					}
					onClick={debug.launch}
				>
					Launch
				</button>
			</div>
			<div className="debug-row">
				<button type="button" className="button" onClick={onEditPresets}>
					Edit presets
				</button>
			</div>
			<div className="debug-row debug-row-wrap">
				<ProcessPicker debug={debug} />
				<button
					type="button"
					className="button"
					disabled={session !== null || debug.status === "launching"}
					onClick={debug.attach}
				>
					Attach
				</button>
			</div>
			{debug.presets.length === 0 ? (
				<p className="debug-note">No presets in .quarry/launch.json</p>
			) : null}
			{debug.resolved === null ? null : (
				<p className="debug-note" title={debug.resolved.program}>
					{truncateLeft(debug.resolved.program)}
				</p>
			)}
			{debug.resolved === null || debug.resolved.initCommands.length === 0 ? null : (
				<p className="debug-note">
					{debug.resolved.initCommands.length} init command
					{debug.resolved.initCommands.length === 1 ? "" : "s"} loaded
				</p>
			)}
			{debug.configError === null ? null : (
				<p className="debug-note" title={debug.configError}>
					{debug.configError}
				</p>
			)}
		</section>
	);
}
