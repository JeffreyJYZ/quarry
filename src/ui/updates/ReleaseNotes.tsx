import { useEffect } from "react";
import { useReleaseNotes } from "@/ui/updates/useReleaseNotes";
import "@/ui/updates/updates.css";

/**
 * What changed in a version, as a panel.
 *
 * Used twice: inline under the update prompt, where it is the reason to press the button, and as a
 * floating panel for the palette command and the first launch after an update.
 */
export default function ReleaseNotes({
	version,
	onClose,
	variant = "panel",
}: {
	version: string;
	onClose?: () => void;
	variant?: "panel" | "inline";
}) {
	const { notes, failed } = useReleaseNotes(version);

	useEffect(() => {
		if (variant !== "panel" || onClose === undefined) return;
		const handle = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handle);
		return () => window.removeEventListener("keydown", handle);
	}, [variant, onClose]);

	// A body written by release-local opens with "Changes since <tag>:", which is a heading, not
	// a change: drawn as a bullet it reads like the first entry in its own list.
	const lead = notes !== null && notes.length > 0 && notes[0].endsWith(":") ? notes[0] : null;
	const items: string[] = notes === null ? [] : lead === null ? notes : notes.slice(1);

	const body =
		notes === null ? (
			<p className="notes-empty">{failed ? "No notes for this version" : "Loading notes…"}</p>
		) : (
			<>
				{lead === null ? null : <p className="notes-lead">{lead}</p>}
				<ul className="notes-list">
					{items.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			</>
		);

	if (variant === "inline") {
		return <div className="notes-inline">{body}</div>;
	}

	return (
		<>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Escape and the Close button are the keyboard paths; the scrim is decoration */}
			<div
				className="notes-scrim"
				onClick={(event) => {
					if (event.target === event.currentTarget) onClose?.();
				}}
			>
				<div
					className="notes-panel"
					role="dialog"
					aria-label={`Release notes for ${version}`}
				>
					<header className="notes-head">
						<span className="notes-title">What's new in {version}</span>
						<button type="button" className="button" onClick={() => onClose?.()}>
							Close
						</button>
					</header>
					{body}
				</div>
			</div>
		</>
	);
}
