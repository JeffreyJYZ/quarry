import type { JSX } from "react";
import {
	BUILD_PROFILES,
	type BuildProfile,
	type EffectivePreferences,
	type ProjectSettings,
	TAB_SIZES,
	type TabSize,
} from "@/lib/settings/model";
import { Segmented } from "./controls";

/** The per-project tab: every value is an override, and inheritance is the default. */
export function ProjectTab(props: {
	project: ProjectSettings | null;
	projectRoot: string | null;
	effective: EffectivePreferences;
	projectEmpty: boolean;
	onChange: (patch: Partial<ProjectSettings>) => void;
	onClear: () => void;
}): JSX.Element {
	const { project, projectRoot, effective, projectEmpty, onChange, onClear } = props;
	return (
		<>
			<p className="settings-hint">
				Overrides for {projectRoot ?? "this project"}. An inherited value follows the user
				tab; nothing is written until you change one.
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
						onChange={(next) => onChange({ editorTabSize: next })}
					/>
				</div>
				<div className="settings-row">
					<span>Format on save</span>
					<Segmented<"on" | "off">
						label="Project format on save"
						value={
							project?.formatOnSave === null || project?.formatOnSave === undefined
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
							onChange({ formatOnSave: next === null ? null : next === "on" })
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
						onChange={(next) => onChange({ buildProfile: next })}
					/>
				</div>
			</section>
			<section className="settings-section">
				<h3 className="settings-heading">CMake</h3>
				<div className="settings-row">
					<label htmlFor="settings-cmake-preset">Configure preset</label>
					<input
						id="settings-cmake-preset"
						type="text"
						className="settings-text"
						value={project?.cmakePreset ?? ""}
						placeholder="empty: the project's only preset"
						spellCheck={false}
						onChange={(event) => onChange({ cmakePreset: event.target.value })}
					/>
				</div>
				<div className="settings-row">
					<label htmlFor="settings-cmake-build-dir">Build directory</label>
					<input
						id="settings-cmake-build-dir"
						type="text"
						className="settings-text"
						value={project?.cmakeBuildDir ?? ""}
						placeholder="empty: detect, then build"
						spellCheck={false}
						onChange={(event) => onChange({ cmakeBuildDir: event.target.value })}
					/>
				</div>
				<div className="settings-row">
					<label htmlFor="settings-cmake-toolchain">Toolchain file</label>
					<input
						id="settings-cmake-toolchain"
						type="text"
						className="settings-text"
						value={project?.cmakeToolchainFile ?? ""}
						placeholder="empty: the preset's own"
						spellCheck={false}
						onChange={(event) => onChange({ cmakeToolchainFile: event.target.value })}
					/>
				</div>
				<p className="settings-hint">
					A name from CMakePresets.json, the directory the build runs in and the toolchain
					it configures with. Empty means the project decides: detection uses an
					already-configured tree, else the preset's directory, else "build".
				</p>
			</section>
			<section className="settings-section">
				<div className="settings-row">
					<span className="settings-hint">
						Effective: tab {effective.editorTabSize} · format{" "}
						{effective.formatOnSave ? "on save" : "manual"} · {effective.buildProfile}
					</span>
					<button
						type="button"
						className="button"
						disabled={projectEmpty}
						onClick={onClear}
					>
						Clear project settings
					</button>
				</div>
			</section>
		</>
	);
}
