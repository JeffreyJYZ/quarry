import type { JSX } from "react";
import {
	BUILD_PROFILES,
	type BuildProfile,
	DEFAULT_PREFERENCES,
	type Preferences,
} from "@/lib/settings/model";
import { checkForUpdates, installNow, type State } from "@/lib/updates/store";
import { Segmented } from "./controls";

/** Build profile, update checks and panel sizes: the sections that drive the shell itself. */
export function ShellSections(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
	onResetPanels: () => void;
	updates: State;
	version: string;
}): JSX.Element {
	const { user, onChange, onResetPanels, updates, version } = props;
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
				<h3 className="settings-heading">Updates</h3>
				<div className="settings-row">
					<span>{version === "" ? "Version unknown" : `Version ${version}`}</span>
					<div className="settings-actions">
						{updates.offer?.kind === "updater" ? (
							<button
								type="button"
								className="button"
								disabled={updates.phase === "downloading"}
								onClick={() => void installNow()}
							>
								{updates.phase === "downloading"
									? `Installing ${updates.progress ?? 0}%`
									: `Install ${updates.offer.version}`}
							</button>
						) : null}
						<button
							type="button"
							className="button"
							disabled={updates.phase === "checking"}
							onClick={() => void checkForUpdates()}
						>
							{updates.phase === "checking" ? "Checking…" : "Check for updates"}
						</button>
					</div>
				</div>
				<p className="settings-hint">
					{updates.phase === "failed" && updates.message !== null
						? `Update check failed: ${updates.message}`
						: updates.phase === "current"
							? "This build is the latest published version."
							: updates.offer !== null
								? `${updates.offer.version} is available.`
								: "Checks run at launch; this button checks now."}
				</p>
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
