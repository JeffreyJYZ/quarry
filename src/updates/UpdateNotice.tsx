import { useEffect } from "react";
import { checkForUpdates, installNow, releaseOffer, useUpdates } from "./store";
import "./updates.css";

export default function UpdateNotice() {
	const state = useUpdates();
	const offer = state.offer;

	/* One check per mount; a failed check is silent, so an offline start is unaffected. */
	useEffect(() => {
		void checkForUpdates();
	}, []);

	if (state.dismissed) return null;

	const downloading = state.phase === "downloading";
	const failed = state.phase === "failed";

	if (offer === null) {
		if (!failed || state.message === null) return null;
		return (
			<div className="update-notice" role="status">
				<span className="update-notice-text">Update failed: {state.message}.</span>
				<a
					className="update-notice-link"
					href="https://github.com/JeffreyJYZ/quarry/releases"
					target="_blank"
					rel="noreferrer"
				>
					Release page
				</a>
				<button
					type="button"
					className="update-notice-dismiss"
					aria-label="Dismiss"
					onClick={() => void releaseOffer()}
				>
					dismiss
				</button>
			</div>
		);
	}

	const installable = offer.kind === "updater";
	const buttonLabel = downloading
		? state.progress === null
			? "Updating…"
			: `Updating ${state.progress}%`
		: "Update now";

	return (
		<div className="update-notice" role="status">
			<span className="update-notice-text">
				{offer.version}{" "}
				{installable
					? "is available."
					: "is published, but this build cannot install it in-app."}
			</span>
			{installable ? (
				<button
					type="button"
					className="update-notice-action"
					disabled={downloading}
					onClick={() => void installNow()}
				>
					{buttonLabel}
				</button>
			) : null}
			{failed && state.message !== null ? (
				<span className="update-notice-fail">
					Update failed: {state.message}.{" "}
					<a
						className="update-notice-link"
						href="https://github.com/JeffreyJYZ/quarry/releases"
						target="_blank"
						rel="noreferrer"
					>
						Release page
					</a>
				</span>
			) : null}
			<button
				type="button"
				className="update-notice-dismiss"
				aria-label="Dismiss"
				onClick={() => void releaseOffer()}
			>
				dismiss
			</button>
		</div>
	);
}
