import { useState } from "react";
import type { ChangeEvent } from "react";
import type { EnvVar } from "@/lib/project/api";
import { envProblem } from "./parts";

export type RunFormState = {
	quickAdd: string;
	changeQuickAdd: (value: string) => void;
	configName: string;
	changeConfigName: (value: string) => void;
	configError: string | null;
	updateRow: (index: number, field: "name" | "value", value: string) => void;
	removeRow: (index: number) => void;
	addRow: () => void;
	handleQuickAddKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	saveConfiguration: () => void;
	handleConfigNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	selectConfiguration: (event: ChangeEvent<HTMLSelectElement>) => void;
	updateConfiguration: () => void;
	deleteConfiguration: () => void;
	envError: string | null;
};

export function useRunForm({
	env,
	onEnvChange,
	onSelectConfiguration,
	onSaveConfiguration,
	onUpdateConfiguration,
	onDeleteConfiguration,
}: {
	env: EnvVar[];
	onEnvChange: (value: EnvVar[]) => void;
	onSelectConfiguration: (name: string) => void;
	onSaveConfiguration: (name: string) => string | null;
	onUpdateConfiguration: () => string | null;
	onDeleteConfiguration: () => string | null;
}): RunFormState {
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

	const envError = envProblem(env);

	return {
		quickAdd,
		changeQuickAdd: setQuickAdd,
		configName,
		changeConfigName: setConfigName,
		configError,
		updateRow,
		removeRow,
		addRow,
		handleQuickAddKeyDown,
		saveConfiguration,
		handleConfigNameKeyDown,
		selectConfiguration,
		updateConfiguration,
		deleteConfiguration,
		envError,
	};
}
