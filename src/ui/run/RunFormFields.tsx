import type { ChangeEvent } from "react";

export function RunFormFields({
	program,
	args,
	cwd,
	onProgramChange,
	onArgsChange,
	onCwdChange,
}: {
	program: string;
	args: string;
	cwd: string;
	onProgramChange: (value: string) => void;
	onArgsChange: (value: string) => void;
	onCwdChange: (value: string) => void;
}) {
	return (
		<>
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
					placeholder="project root when empty"
					value={cwd}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onCwdChange(event.target.value)
					}
				/>
			</div>
		</>
	);
}
