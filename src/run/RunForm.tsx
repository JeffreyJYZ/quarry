import type { ChangeEvent } from "react";
import { useState } from "react";
import type { EnvVar, RunConfiguration } from "@/project/api";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
	const [quickAdd, setQuickAdd] = useState("");
	const [configName, setConfigName] = useState("");
	const [configError, setConfigError] = useState<string | null>(null);

	const updateRow = (index: number, field: "name" | "value", value: string) => {
		const next = env.map((row, rowIndex) =>
			rowIndex === index ? { ...row, [field]: value } : row,
		);
		onEnvChange(next);
	};

	const removeRow = (index: number) => {
		onEnvChange(env.filter((_, rowIndex) => rowIndex !== index));
	};

	const addRow = () => {
		onEnvChange([...env, { name: "", value: "" }]);
	};

	const handleQuickAddKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") {
			return;
		}
		const raw = quickAdd;
		const eq = raw.indexOf("=");
		let name: string;
		let value: string;
		if (eq === -1) {
			name = raw.trim();
			value = "";
		} else {
			name = raw.slice(0, eq).trim();
			value = raw.slice(eq + 1);
		}
		onEnvChange([...env, { name, value }]);
		setQuickAdd("");
	};

	const saveConfiguration = () => {
		const error = onSaveConfiguration(configName);
		setConfigError(error);
		if (error === null) {
			setConfigName("");
		}
	};

	const handleConfigNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			saveConfiguration();
		}
	};

	const selectConfiguration = (event: ChangeEvent<HTMLSelectElement>) => {
		setConfigError(null);
		onSelectConfiguration(event.target.value);
	};

	const updateConfiguration = () => {
		setConfigError(onUpdateConfiguration());
	};

	const deleteConfiguration = () => {
		setConfigError(onDeleteConfiguration());
	};

	let problem: string | null = null;
	const seen = new Set<string>();
	for (const row of env) {
		if (!NAME_RE.test(row.name)) {
			problem = `invalid env name: ${row.name === "" ? "(empty)" : row.name}`;
			break;
		}
		if (seen.has(row.name)) {
			problem = `duplicate env name: ${row.name}`;
			break;
		}
		seen.add(row.name);
	}
	const envError = problem;

	return (
		<div className="run-form">
			<div className="run-form-head">
				<span className="label">run configuration</span>
				<button type="button" className="run-form-close" onClick={onClose}>
					close
				</button>
			</div>
			<div className="run-form-configs">
				<div className="run-form-row">
					<span className="run-form-label">config</span>
					<select
						className="run-form-input"
						value={selectedConfiguration ?? ""}
						onChange={selectConfiguration}
					>
						<option value="">(unsaved)</option>
						{configurations.map((config) => (
							<option key={config.name} value={config.name}>
								{config.name}
							</option>
						))}
					</select>
				</div>
				<div className="run-form-row">
					<span className="run-form-label">save as</span>
					<input
						className="run-form-input"
						placeholder="name, Enter to save"
						value={configName}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							setConfigName(event.target.value)
						}
						onKeyDown={handleConfigNameKeyDown}
					/>
					<button type="button" className="button" onClick={saveConfiguration}>
						Save
					</button>
					<button
						type="button"
						className="button"
						disabled={selectedConfiguration === null}
						onClick={updateConfiguration}
					>
						Update
					</button>
					<button
						type="button"
						className="button"
						disabled={selectedConfiguration === null}
						onClick={deleteConfiguration}
					>
						Delete
					</button>
				</div>
				{configError === null ? null : <div className="run-form-error">{configError}</div>}
			</div>
			<div className="run-form-row">
				<span className="run-form-label">program</span>
				<input
					className="run-form-input"
					value={program}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onProgramChange(event.target.value)
					}
				/>
			</div>
			<div className="run-form-row">
				<span className="run-form-label">args</span>
				<input
					className="run-form-input"
					value={args}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onArgsChange(event.target.value)
					}
				/>
			</div>
			<div className="run-form-row">
				<span className="run-form-label">cwd</span>
				<input
					className="run-form-input"
					value={cwd}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onCwdChange(event.target.value)
					}
				/>
			</div>
			<div className="run-form-env">
				<div className="run-form-env-head">
					<span className="run-form-label">env</span>
					<button type="button" className="button" onClick={addRow}>
						+
					</button>
				</div>
				<input
					className="run-form-input"
					placeholder="NAME=value, Enter to add"
					value={quickAdd}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						setQuickAdd(event.target.value)
					}
					onKeyDown={handleQuickAddKeyDown}
				/>
				{env.map((row, index) => {
					const invalid = !NAME_RE.test(row.name);
					const duplicate =
						row.name !== "" && env.filter((r) => r.name === row.name).length > 1;
					return (
						<div key={`${row.name}-${row.value}`} className="run-form-env-row">
							<input
								className={
									invalid || duplicate
										? "run-form-input run-form-input-invalid"
										: "run-form-input"
								}
								value={row.name}
								onChange={(event: ChangeEvent<HTMLInputElement>) =>
									updateRow(index, "name", event.target.value)
								}
							/>
							<span>=</span>
							<input
								className="run-form-input"
								value={row.value}
								onChange={(event: ChangeEvent<HTMLInputElement>) =>
									updateRow(index, "value", event.target.value)
								}
							/>
							<button
								type="button"
								className="button"
								onClick={() => removeRow(index)}
							>
								×
							</button>
						</div>
					);
				})}
				{envError === null ? null : <div className="run-form-error">{envError}</div>}
			</div>
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
						disabled={program === "" || cwdError !== null || envError !== null}
						onClick={onRun}
					>
						Run
					</button>
				)}
			</div>
		</div>
	);
}
