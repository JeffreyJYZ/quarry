import { useCallback } from "react";
import type { EnvVar, RunConfiguration } from "@/lib/project/api";
import {
	applyConfiguration,
	configurationNameError,
	snapshotConfiguration,
} from "@/lib/run/configurations";

export type RunForm = { program: string; args: string; cwd: string; env: EnvVar[] };

export type RunFormFill = (next: RunForm) => void;

/** The run form's saved configurations: select, save, update and delete. */
export function useRunConfigurations(options: {
	configurations: RunConfiguration[];
	selected: string | null;
	setConfigurations: (updater: (current: RunConfiguration[]) => RunConfiguration[]) => void;
	setSelected: (name: string | null) => void;
	form: RunForm;
	onFill: RunFormFill;
}) {
	const { configurations, selected, setConfigurations, setSelected, form, onFill } = options;

	const select = useCallback(
		(name: string) => {
			setSelected(name === "" ? null : name);
			const config = configurations.find((item) => item.name === name);
			if (config === undefined) return;
			const filled = applyConfiguration(config);
			onFill(filled);
		},
		[configurations, setSelected, onFill],
	);

	const save = useCallback(
		(name: string) => {
			const error = configurationNameError(name, configurations);
			if (error !== null) return error;
			const config = snapshotConfiguration(name, form);
			setConfigurations((current) => [...current, config]);
			setSelected(config.name);
			return null;
		},
		[configurations, form, setConfigurations, setSelected],
	);

	const update = useCallback(() => {
		if (selected === null) return "select a configuration first";
		const config = snapshotConfiguration(selected, form);
		setConfigurations((current) =>
			current.map((item) => (item.name === selected ? config : item)),
		);
		return null;
	}, [selected, form, setConfigurations]);

	const remove = useCallback(() => {
		if (selected === null) return "select a configuration first";
		setConfigurations((current) => current.filter((item) => item.name !== selected));
		setSelected(null);
		return null;
	}, [selected, setConfigurations, setSelected]);

	return { select, save, update, remove };
}
