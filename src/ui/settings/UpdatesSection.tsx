import type { JSX } from "react";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdates, restartWithUpdate, useUpdates } from "@/lib/updates/store";

/** Settings section for the app's update state and manual checks. */
export function UpdatesSection(): JSX.Element {
	const updates = useUpdates();
	const [version, setVersion] = useState("");

	useEffect(() => {
		void getVersion().then(setVersion, () => setVersion(""));
	}, []);

	const busy = updates.phase === "checking" || updates.phase === "downloading";

	let status = "up to date";
	if (updates.phase === "checking") status = "checking…";
	else if (updates.phase === "downloading") {
		status = updates.progress === null ? "downloading…" : `downloading … ${updates.progress}%`;
	} else if (updates.phase === "ready") {
		status = `version ${updates.offer?.version ?? ""} is ready`;
	} else if (updates.phase === "failed") {
		status = "last check failed";
	}

	return (
		<section className="settings-section">
			<h3 className="settings-heading">updates</h3>
			<div className="settings-row">
				<span>version</span>
				<span className="settings-mono">{version === "" ? "unknown" : version}</span>
			</div>
			<div className="settings-row">
				<span style={{ color: "var(--muted)" }}>{status}</span>
				<div className="settings-actions">
					{updates.phase === "ready" ? (
						<button
							type="button"
							className="button"
							onClick={() => void restartWithUpdate()}
						>
							Restart to update
						</button>
					) : null}
					<button
						type="button"
						className="button"
						disabled={busy}
						title={
							updates.phase === "failed" && updates.message !== null
								? updates.message
								: undefined
						}
						onClick={() => void checkForUpdates()}
					>
						Check for updates
					</button>
				</div>
			</div>
			{updates.phase === "failed" && updates.message !== null ? (
				<p className="settings-hint" title={updates.message}>
					{updates.message}
				</p>
			) : null}
		</section>
	);
}
