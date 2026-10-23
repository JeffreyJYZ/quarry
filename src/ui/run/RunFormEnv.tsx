import type { ChangeEvent } from "react";
import type { EnvVar } from "@/lib/project/api";
import { NAME_RE } from "./parts";

export function RunFormEnv({
	env,
	quickAdd,
	envError,
	onChangeQuickAdd,
	onQuickAddKeyDown,
	onAddRow,
	onUpdateRow,
	onRemoveRow,
}: {
	env: EnvVar[];
	quickAdd: string;
	envError: string | null;
	onChangeQuickAdd: (value: string) => void;
	onQuickAddKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	onAddRow: () => void;
	onUpdateRow: (index: number, field: "name" | "value", value: string) => void;
	onRemoveRow: (index: number) => void;
}) {
	return (
		<div className="run-form-env">
			<div className="run-form-env-head">
				<span className="run-form-label">env</span>
				<button type="button" className="button" onClick={onAddRow}>
					+
				</button>
			</div>
			<input
				className="run-form-input"
				placeholder="NAME=value, Enter to add"
				value={quickAdd}
				onChange={(event: ChangeEvent<HTMLInputElement>) =>
					onChangeQuickAdd(event.target.value)
				}
				onKeyDown={onQuickAddKeyDown}
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
								onUpdateRow(index, "name", event.target.value)
							}
						/>
						<span>=</span>
						<input
							className="run-form-input"
							value={row.value}
							onChange={(event: ChangeEvent<HTMLInputElement>) =>
								onUpdateRow(index, "value", event.target.value)
							}
						/>
						<button type="button" className="button" onClick={() => onRemoveRow(index)}>
							×
						</button>
					</div>
				);
			})}
			{envError === null ? null : <div className="run-form-error">{envError}</div>}
		</div>
	);
}
