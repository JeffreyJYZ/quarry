import type { EnvVar, RunConfiguration } from "@/lib/project/api";
import { RunFormConfigs } from "./RunFormConfigs";
import { RunFormEnv } from "./RunFormEnv";
import { RunFormFields } from "./RunFormFields";
import { useRunForm } from "./useRunForm";

export type RunFormProps = {
	program: string;
	args: string;
	cwd: string;
	argv: string;
	cwdError: string | null;
	running: boolean;
	env: EnvVar[];
	configurations: RunConfiguration[];
	selectedConfiguration: string | null;
	onProgramChange: (value: string) => void;
	onArgsChange: (value: string) => void;
	onCwdChange: (value: string) => void;
	onEnvChange: (value: EnvVar[]) => void;
	onSelectConfiguration: (name: string) => void;
	/** Saves the form under a name; returns the rejection to show, or `null` when it saved. */
	onSaveConfiguration: (name: string) => string | null;
	onUpdateConfiguration: () => string | null;
	onDeleteConfiguration: () => string | null;
	onRun: () => void;
	onStop: () => void;
	/** Dismisses the panel; the toolbar and the shortcut reopen it. */
	onClose: () => void;
};

export default function RunForm({
	program,
	args,
	cwd,
	argv,
	cwdError,
	running,
	env,
	configurations,
	selectedConfiguration,
	onProgramChange,
	onArgsChange,
	onCwdChange,
	onEnvChange,
	onSelectConfiguration,
	onSaveConfiguration,
	onUpdateConfiguration,
	onDeleteConfiguration,
	onRun,
	onStop,
	onClose,
}: RunFormProps) {
	const form = useRunForm({
		env,
		onEnvChange,
		onSelectConfiguration,
		onSaveConfiguration,
		onUpdateConfiguration,
		onDeleteConfiguration,
	});

	return (
		<div className="run-form">
			<div className="run-form-head">
				<span className="label">run configuration</span>
				<button type="button" className="run-form-close" onClick={onClose}>
					close
				</button>
			</div>
			<RunFormConfigs
				configurations={configurations}
				selectedConfiguration={selectedConfiguration}
				configName={form.configName}
				configError={form.configError}
				onSelectConfiguration={form.selectConfiguration}
				onConfigNameChange={form.changeConfigName}
				onSave={form.saveConfiguration}
				onUpdate={form.updateConfiguration}
				onDelete={form.deleteConfiguration}
			/>
			<RunFormFields
				program={program}
				args={args}
				cwd={cwd}
				onProgramChange={onProgramChange}
				onArgsChange={onArgsChange}
				onCwdChange={onCwdChange}
			/>
			<RunFormEnv
				env={env}
				quickAdd={form.quickAdd}
				envError={form.envError}
				onChangeQuickAdd={form.changeQuickAdd}
				onQuickAddKeyDown={form.handleQuickAddKeyDown}
				onAddRow={form.addRow}
				onUpdateRow={form.updateRow}
				onRemoveRow={form.removeRow}
			/>
			{cwdError === null ? null : <div className="run-form-error">{cwdError}</div>}
			<div className="run-form-actions">
				<span className="run-form-argv" title={argv}>
					{argv}
				</span>
				{running ? (
					<button type="button" className="button" onClick={onStop}>
						Stop
					</button>
				) : (
					<button
						type="button"
						className="button"
						disabled={program === "" || cwdError !== null || form.envError !== null}
						onClick={onRun}
					>
						Run
					</button>
				)}
			</div>
		</div>
	);
}
