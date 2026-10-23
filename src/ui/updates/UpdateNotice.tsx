import { useEffect } from "react";
import { checkForUpdates, installNow, releaseOffer, useUpdates } from "@/lib/updates/store";
import "@/ui/updates/updates.css";

/**
 * The update popup.
 *
 * Nothing about an update is automatic: the launch check only asks whether a newer release exists,
 * and this dialog is the one place that says so. Downloading and installing happen on the button, and
 * dismissing it leaves the build untouched until the next launch.
 */
export default function UpdateNotice() {
	const state = useUpdates();
	const offer = state.offer;

	useEffect(() => {
		void checkForUpdates();
	}, []);

	if (state.dismissed) return null;

	const downloading = state.phase === "downloading";
	const failed = state.phase === "failed";

	if (offer === null && !(failed && state.message !== null)) return null;

	const installable = offer?.kind === "updater";

	return (
		<div className="update-modal-backdrop" role="presentation">
			<div
				className="update-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="update-title"
			>
				<header className="update-modal-head">
					<span className="label" id="update-title">
						update available
					</span>
					<button
						type="button"
						className="update-modal-close"
						onClick={() => void releaseOffer()}
					>
						later
					</button>
				</header>

				<div className="update-modal-body">
					{offer === null ? null : (
						<>
							<p className="update-modal-version">quarry {offer.version}</p>
							<p className="update-modal-text">
								{installable
									? "Downloading starts when you choose Update now. Nothing changes until then."
									: "This build cannot install it in-app; the release page has the download."}
							</p>
						</>
					)}
					{failed && state.message !== null ? (
						<p className="update-modal-error">Update failed: {state.message}</p>
					) : null}
					{downloading ? (
						<p className="update-modal-text">
							{state.progress === null
								? "Downloading…"
								: `Downloading ${state.progress}%`}
						</p>
					) : null}
				</div>

				<footer className="update-modal-foot">
					<a
						className="update-modal-link"
						href="https://github.com/JeffreyJYZ/quarry/releases"
						target="_blank"
						rel="noreferrer"
					>
						Release page
					</a>
					<div className="update-modal-actions">
						<button
							type="button"
							className="button"
							onClick={() => void releaseOffer()}
						>
							Later
						</button>
						{installable ? (
							<button
								type="button"
								className="button update-modal-install"
								disabled={downloading}
								onClick={() => void installNow()}
							>
								{downloading ? "Updating…" : "Update now"}
							</button>
						) : null}
					</div>
				</footer>
			</div>
		</div>
	);
}
