import type { ChangeEvent } from "react";
import { useState } from "react";
import type { EnvVar } from "@/project/api";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type RunFormProps = {
	program: string;
	args: string;
	cwd: string;
	argv: string;
	cwdError: string | null;
	running: boolean;
	env: EnvVar[];
	onArgsChange: (value: string) => void;
	onCwdChange: (value: string) => void;
	onEnvChange: (value: EnvVar[]) => void;
	onRun: () => void;
	onStop: () => void;
};

export default function RunForm({
	program,
	args,
	cwd,
	argv,
	cwdError,
	running,
	env,
	onArgsChange,
	onCwdChange,
	onEnvChange,
	onRun,
	onStop,
}: RunFormProps) {
	const [quickAdd, setQuickAdd] = useState("");

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
			<div className="run-form-row">
				<span className="run-form-label">program</span>
				<input className="run-form-input" value={program} readOnly />
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
