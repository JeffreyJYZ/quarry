import { type JSX, useEffect, useRef, useState } from "react";
import {
	BUILD_PROFILES,
	type BuildProfile,
	clampFontSize,
	DEFAULT_PREFERENCES,
	effectivePreferences,
	FONT_SIZE_RANGE,
	normalizePreferences,
	normalizeProjectSettings,
	projectSettingsAreEmpty,
	type Preferences,
	type ProjectSettings,
	TAB_SIZES,
	type TabSize,
	type TerminalPlacement,
} from "@/settings/model";
import "@/settings/settings.css";

export type SettingsPageProps = {
	open: boolean;
	user: Preferences;
	/** null when no project is open, or when the project file does not exist yet. */
	project: ProjectSettings | null;
	projectRoot: string | null;
	onClose: () => void;
	onUserChange: (next: Preferences) => void;
	/** null removes the project's overrides; the caller deletes the file. */
	onProjectChange: (next: ProjectSettings | null) => void;
	/** Resets every panel size to the default. */
	onResetPanels: () => void;
	/** Tab to show when the page opens; Cmd ; asks for the project tab. */
	initialTab?: Tab;
};

type Tab = "user" | "project";

function Stepper(props: {
	id: string;
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (next: number) => void;
}): JSX.Element {
	const { id, label, value, min, max, onChange } = props;
	return (
		<div className="settings-stepper">
			<button
				type="button"
				className="settings-step"
				aria-label={`Decrease ${label}`}
				disabled={value <= min}
				onClick={() => onChange(clampFontSize(value - 1, min))}
			>
				−
			</button>
			<input
				id={id}
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(event) => onChange(clampFontSize(Number(event.target.value), value))}
			/>
			<button
				type="button"
				className="settings-step"
				aria-label={`Increase ${label}`}
				disabled={value >= max}
				onClick={() => onChange(clampFontSize(value + 1, max))}
			>
				+
			</button>
		</div>
	);
}

function Segmented<T extends string | number>(props: {
	label: string;
	value: T | null;
	options: { value: T; label: string }[];
	allowInherit?: boolean;
	onChange: (next: T | null) => void;
}): JSX.Element {
	const { label, value, options, allowInherit = false, onChange } = props;
	return (
		<div className="settings-segmented" role="group" aria-label={label}>
			{allowInherit ? (
				<button
					type="button"
					className={value === null ? "settings-seg active" : "settings-seg"}
					aria-pressed={value === null}
					onClick={() => onChange(null)}
				>
					Inherit
				</button>
			) : null}
			{options.map((option) => (
				<button
					key={String(option.value)}
					type="button"
					className={value === option.value ? "settings-seg active" : "settings-seg"}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

/**
 * The settings page: a user-wide tab and a per-project tab that can only narrow the user's values.
 *
 * Every edit goes straight back through `onUserChange`/`onProjectChange`; there is no local draft and
 * no save button, so what the page shows is always what the shell is already using.
 */
export default function SettingsPage({
	open,
	user,
	project,
	projectRoot,
	onClose,
	onUserChange,
	onProjectChange,
	onResetPanels,
	initialTab = "user",
}: SettingsPageProps): JSX.Element | null {
	const [tab, setTab] = useState<Tab>(initialTab);
	const panelRef = useRef<HTMLDivElement>(null);
	const effective = effectivePreferences(user, project);
	const projectEmpty = project === null || projectSettingsAreEmpty(project);

	useEffect(() => {
		if (!open) return;
		setTab(initialTab);
		panelRef.current?.focus();
	}, [initialTab, open]);

	if (!open) return null;

	const setUser = (patch: Partial<Preferences>) => {
		onUserChange(normalizePreferences({ ...user, ...patch }));
	};
	const setProject = (patch: Partial<ProjectSettings>) => {
		onProjectChange(normalizeProjectSettings({ ...(project ?? {}), ...patch }));
	};

	return (
		<div
			className="settings-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="settings-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-title"
				tabIndex={-1}
				ref={panelRef}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					}
				}}
			>
				<header className="settings-head">
					<span className="label" id="settings-title">
						settings
					</span>
					<button type="button" className="settings-close" onClick={onClose}>
						close
					</button>
				</header>

				<div className="settings-tabs" role="tablist" aria-label="Settings scope">
					<button
						type="button"
						role="tab"
						aria-selected={tab === "user"}
						className={tab === "user" ? "settings-tab active" : "settings-tab"}
						onClick={() => setTab("user")}
					>
						User
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "project"}
						disabled={projectRoot === null}
						title={projectRoot === null ? "Open a project first" : projectRoot}
						className={tab === "project" ? "settings-tab active" : "settings-tab"}
						onClick={() => setTab("project")}
					>
						This project
					</button>
				</div>

				<div className="settings-body">
					{tab === "user" ? (
						<>
							<section className="settings-section">
								<h3 className="settings-heading">Editor</h3>
								<div className="settings-row">
									<label htmlFor="settings-editor-font">Font size</label>
									<Stepper
										id="settings-editor-font"
										label="editor font size"
										value={user.editorFontSize}
										min={FONT_SIZE_RANGE.min}
										max={FONT_SIZE_RANGE.max}
										onChange={(next) => setUser({ editorFontSize: next })}
									/>
								</div>
								<div className="settings-row">
									<span>Tab size</span>
									<Segmented<TabSize>
										label="Tab size"
										value={user.editorTabSize}
										options={TAB_SIZES.map((size) => ({
											value: size,
											label: String(size),
										}))}
										onChange={(next) => {
											if (next !== null) setUser({ editorTabSize: next });
										}}
									/>
								</div>
								<div className="settings-row">
									<label htmlFor="settings-format-save">Format on save</label>
									<input
										id="settings-format-save"
										type="checkbox"
										checked={user.formatOnSave}
										onChange={(event) =>
											setUser({ formatOnSave: event.target.checked })
										}
									/>
								</div>
							</section>

							<section className="settings-section">
								<h3 className="settings-heading">Terminal</h3>
								<div className="settings-row">
									<span>Placement</span>
									<Segmented<TerminalPlacement>
										label="Terminal placement"
										value={user.terminalPlacement}
										options={[
											{ value: "bottom", label: "bottom" },
											{ value: "right", label: "right" },
										]}
										onChange={(next) => {
											if (next !== null) setUser({ terminalPlacement: next });
										}}
									/>
								</div>
								<div className="settings-row">
									<label htmlFor="settings-terminal-font">Font size</label>
									<Stepper
										id="settings-terminal-font"
										label="terminal font size"
										value={user.terminalFontSize}
										min={FONT_SIZE_RANGE.min}
										max={FONT_SIZE_RANGE.max}
										onChange={(next) => setUser({ terminalFontSize: next })}
									/>
								</div>
							</section>

							<section className="settings-section">
								<h3 className="settings-heading">Build</h3>
								<div className="settings-row">
									<span>Default profile</span>
									<Segmented<BuildProfile>
										label="Default build profile"
										value={user.buildProfile}
										options={BUILD_PROFILES.map((profile) => ({
											value: profile,
											label: profile,
										}))}
										onChange={(next) => {
											if (next !== null) setUser({ buildProfile: next });
										}}
									/>
								</div>
							</section>

							<section className="settings-section">
								<h3 className="settings-heading">Panels</h3>
								<div className="settings-row">
									<span className="settings-mono">
										{user.panelSizes.railWidth} · {user.panelSizes.debugWidth} ·{" "}
										{user.panelSizes.dockHeight} ·{" "}
										{user.panelSizes.terminalHeight}
									</span>
									<button
										type="button"
										className="button"
										onClick={onResetPanels}
									>
										Reset panel sizes
									</button>
								</div>
								<p className="settings-hint">
									Explorer width · debug width · dock height · terminal height.
									Defaults are {DEFAULT_PREFERENCES.panelSizes.railWidth} ·{" "}
									{DEFAULT_PREFERENCES.panelSizes.debugWidth} ·{" "}
									{DEFAULT_PREFERENCES.panelSizes.dockHeight} ·{" "}
									{DEFAULT_PREFERENCES.panelSizes.terminalHeight}.
								</p>
							</section>
						</>
					) : (
						<>
							<p className="settings-hint">
								Overrides for {projectRoot ?? "this project"}. An inherited value
								follows the user tab; nothing is written until you change one.
							</p>
							<section className="settings-section">
								<h3 className="settings-heading">Editor</h3>
								<div className="settings-row">
									<span>Tab size</span>
									<Segmented<TabSize>
										label="Project tab size"
										value={project?.editorTabSize ?? null}
										allowInherit
										options={TAB_SIZES.map((size) => ({
											value: size,
											label: String(size),
										}))}
										onChange={(next) => setProject({ editorTabSize: next })}
									/>
								</div>
								<div className="settings-row">
									<span>Format on save</span>
									<Segmented<"on" | "off">
										label="Project format on save"
										value={
											project?.formatOnSave === null ||
											project?.formatOnSave === undefined
												? null
												: project.formatOnSave
													? "on"
													: "off"
										}
										allowInherit
										options={[
											{ value: "on", label: "on" },
											{ value: "off", label: "off" },
										]}
										onChange={(next) =>
											setProject({
												formatOnSave: next === null ? null : next === "on",
											})
										}
									/>
								</div>
							</section>
							<section className="settings-section">
								<h3 className="settings-heading">Build</h3>
								<div className="settings-row">
									<span>Profile</span>
									<Segmented<BuildProfile>
										label="Project build profile"
										value={project?.buildProfile ?? null}
										allowInherit
										options={BUILD_PROFILES.map((profile) => ({
											value: profile,
											label: profile,
										}))}
										onChange={(next) => setProject({ buildProfile: next })}
									/>
								</div>
							</section>
							<section className="settings-section">
								<div className="settings-row">
									<span className="settings-hint">
										Effective: tab {effective.editorTabSize} · format{" "}
										{effective.formatOnSave ? "on save" : "manual"} ·{" "}
										{effective.buildProfile}
									</span>
									<button
										type="button"
										className="button"
										disabled={projectEmpty}
										onClick={() => onProjectChange(null)}
									>
										Clear project settings
									</button>
								</div>
							</section>
						</>
					)}
				</div>

				<footer className="settings-foot">
					<span className="settings-hint">
						{tab === "user"
							? "Applies to every project"
							: "Applies to this project only"}
					</span>
					<span className="settings-mono">cmd/ctrl + ,</span>
				</footer>
			</div>
		</div>
	);
}
