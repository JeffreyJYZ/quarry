import type { RunConfiguration } from "@/lib/project/api";
import type { EnvVar } from "@/lib/project/api";
import { isAbsoluteRunPath } from "@/lib/run/cwd";
import { splitArgs } from "@/lib/run/splitArgs";
import RunForm from "@/ui/run/RunForm";
import RunLog from "@/ui/run/RunLog";
import type { RunLine } from "@/ui/run/RunLog";

type RunExit = { code: number | null; killed?: boolean };

export type RunSectionProps = {
	root: string | null;
	open: boolean;
	program: string;
	args: string;
	cwd: string;
	env: EnvVar[];
	configurations: RunConfiguration[];
	selectedConfiguration: string | null;
	running: boolean;
	lines: RunLine[];
	exited: RunExit | null;
	onProgramChange: (value: string) => void;
	onArgsChange: (value: string) => void;
	onCwdChange: (value: string) => void;
	onEnvChange: (value: EnvVar[]) => void;
	onSelectConfiguration: (name: string) => void;
	onSaveConfiguration: (name: string) => string | null;
	onUpdateConfiguration: () => string | null;
	onDeleteConfiguration: () => string | null;
	onRun: () => void;
	onStop: () => void;
	onClose: () => void;
	onClearLog: () => void;
};

/** The run form and its log, both docked under the editor while a configuration is open. */
export default function RunSection(props: RunSectionProps) {
	const argv = [props.program, ...splitArgs(props.args)].join(" ");
	const showLog = props.running || props.lines.length > 0 || props.exited !== null;

	return (
		<>
			{props.root !== null && props.open ? (
				<RunForm
					program={props.program}
					args={props.args}
					cwd={props.cwd}
					argv={argv}
					cwdError={
						props.cwd !== "" && !isAbsoluteRunPath(props.cwd)
							? "cwd must be absolute"
							: null
					}
					running={props.running}
					env={props.env}
					configurations={props.configurations}
					selectedConfiguration={props.selectedConfiguration}
					onProgramChange={props.onProgramChange}
					onArgsChange={props.onArgsChange}
					onCwdChange={props.onCwdChange}
					onEnvChange={props.onEnvChange}
					onSelectConfiguration={props.onSelectConfiguration}
					onSaveConfiguration={props.onSaveConfiguration}
					onUpdateConfiguration={props.onUpdateConfiguration}
					onDeleteConfiguration={props.onDeleteConfiguration}
					onRun={props.onRun}
					onStop={props.onStop}
					onClose={props.onClose}
				/>
			) : null}
			{showLog ? (
				<RunLog
					lines={props.lines}
					exited={props.exited}
					argv={argv}
					running={props.running}
					onRerun={props.onRun}
					onClear={props.onClearLog}
				/>
			) : null}
		</>
	);
}
