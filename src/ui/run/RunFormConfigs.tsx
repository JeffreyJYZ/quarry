import type { ChangeEvent } from "react";
import type { RunConfiguration } from "@/lib/project/api";

export function RunFormConfigs({
	configurations,
	selectedConfiguration,
	configName,
	configError,
	onSelectConfiguration,
	onConfigNameChange,
	onSave,
	onUpdate,
	onDelete,
}: {
	configurations: RunConfiguration[];
	selectedConfiguration: string | null;
	configName: string;
	configError: string | null;
	onSelectConfiguration: (event: ChangeEvent<HTMLSelectElement>) => void;
	onConfigNameChange: (value: string) => void;
	onSave: () => void;
	onUpdate: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="run-form-configs">
			<div className="run-form-row">
				<span className="run-form-label">config</span>
				<select
					className="run-form-input"
					value={selectedConfiguration ?? ""}
					onChange={onSelectConfiguration}
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
						onConfigNameChange(event.target.value)
					}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							onSave();
						}
					}}
				/>
				<button type="button" className="button" onClick={onSave}>
					Save
				</button>
				<button
					type="button"
					className="button"
					disabled={selectedConfiguration === null}
					onClick={onUpdate}
				>
					Update
				</button>
				<button
					type="button"
					className="button"
					disabled={selectedConfiguration === null}
					onClick={onDelete}
				>
					Delete
				</button>
			</div>
			{configError === null ? null : <div className="run-form-error">{configError}</div>}
		</div>
	);
}
