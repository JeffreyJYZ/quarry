import type { JSX } from "react";
import {
	BUILD_PROFILES,
	type BuildProfile,
	DEFAULT_PREFERENCES,
	type Preferences,
} from "@/lib/settings/model";

import { Segmented } from "./controls";

/** Build profile, update checks and panel sizes: the sections that drive the shell itself. */
export function ShellSections(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
	onResetPanels: () => void;
}): JSX.Element {
	const { user, onChange, onResetPanels } = props;
	return (
		<>
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
							if (next !== null) onChange({ buildProfile: next });
						}}
					/>
				</div>
			</section>

			<section className="settings-section">
				<h3 className="settings-heading">Panels</h3>
				<div className="settings-row">
					<span className="settings-mono">
						{user.panelSizes.railWidth} · {user.panelSizes.debugWidth} ·{" "}
						{user.panelSizes.dockHeight} · {user.panelSizes.terminalHeight}
					</span>
					<button type="button" className="button" onClick={onResetPanels}>
						Reset panel sizes
					</button>
				</div>
				<p className="settings-hint">
					Explorer width · debug width · dock height · terminal height. Defaults are{" "}
					{DEFAULT_PREFERENCES.panelSizes.railWidth} ·{" "}
					{DEFAULT_PREFERENCES.panelSizes.debugWidth} ·{" "}
					{DEFAULT_PREFERENCES.panelSizes.dockHeight} ·{" "}
					{DEFAULT_PREFERENCES.panelSizes.terminalHeight}.
				</p>
			</section>
		</>
	);
}
