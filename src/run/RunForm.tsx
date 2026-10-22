import type { ChangeEvent } from "react";

export type RunFormProps = {
	program: string;
	args: string;
	cwd: string;
	argv: string;
	cwdError: string | null;
	running: boolean;
	onArgsChange: (value: string) => void;
	onCwdChange: (value: string) => void;
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
	onArgsChange,
	onCwdChange,
	onRun,
	onStop,
}: RunFormProps) {
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
						disabled={program === "" || cwdError !== null}
						onClick={onRun}
					>
						Run
					</button>
				)}
			</div>
		</div>
	);
}
