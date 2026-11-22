import { useEffect, type ReactNode } from "react";
import { NOTES_EMPTY, NOTES_FAILED, NOTES_LOADING } from "@/lib/updates/messages";
import type { NoteBlock } from "@/lib/updates/notes";
import { useDialogFocus } from "@/ui/app/useDialogFocus";
import { useReleaseNotes } from "@/ui/updates/useReleaseNotes";
import "@/ui/updates/updates.css";

/** An entry and the paragraph blocks that follow it, kept as siblings for the panel to render. */
type Entry = { text: string; number: string | null; bodies: string[] };
type Section = { heading: string | null; entries: Entry[]; loose: string[] };

/**
 * Rebuild the hierarchy the markdown had: a heading starts a section, an entry starts a bullet, and a
 * body belongs to the entry before it. A body under a heading with no entry stays loose.
 */
function sectionsOf(blocks: NoteBlock[]): { lead: string | null; sections: Section[] } {
	const sections: Section[] = [];
	let current: Section = { heading: null, entries: [], loose: [] };
	let entry: Entry | null = null;
	let lead: string | null = null;

	const finishEntry = () => {
		if (entry !== null) {
			current.entries.push(entry);
			entry = null;
		}
	};
	const finishSection = () => {
		finishEntry();
		if (current.heading !== null || current.entries.length > 0 || current.loose.length > 0) {
			sections.push(current);
		}
		current = { heading: null, entries: [], loose: [] };
	};

	for (const block of blocks) {
		if (block.kind === "lead") {
			lead = block.text;
		} else if (block.kind === "heading") {
			finishSection();
			current.heading = block.text;
		} else if (block.kind === "entry") {
			finishEntry();
			entry = { text: block.text, number: block.number, bodies: [] };
		} else if (entry !== null) {
			entry.bodies.push(block.text);
		} else {
			current.loose.push(block.text);
		}
	}
	finishSection();
	return { lead, sections };
}

/** Each kind gets its own element: only entries are bullets. */
function NotesBody({ blocks }: { blocks: NoteBlock[] }): ReactNode {
	const { lead, sections } = sectionsOf(blocks);
	return (
		<>
			{lead === null ? null : <p className="notes-lead">{lead}</p>}
			{sections.map((section) => (
				<div
					className="notes-section"
					key={section.heading ?? section.entries[0]?.text ?? section.loose[0]}
				>
					{section.heading === null ? null : (
						<p className="notes-heading">{section.heading}</p>
					)}
					{section.loose.map((text) => (
						<p className="notes-body" key={text}>
							{text}
						</p>
					))}
					{section.entries.length === 0 ? null : (
						<ul className="notes-list">
							{section.entries.map((item) => (
								<li className="notes-entry" key={item.text}>
									<span className="notes-entry-title">{item.text}</span>
									{item.number === null ? null : (
										<span className="notes-entry-number">#{item.number}</span>
									)}
									{item.bodies.map((text) => (
										<p className="notes-entry-body" key={text}>
											{text}
										</p>
									))}
								</li>
							))}
						</ul>
					)}
				</div>
			))}
		</>
	);
}

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
	const { panelRef, onKeyDown } = useDialogFocus(variant !== "inline");

	useEffect(() => {
		if (variant !== "panel" || onClose === undefined) return;
		const handle = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handle);
		return () => window.removeEventListener("keydown", handle);
	}, [variant, onClose]);

	const body =
		notes === null ? (
			<p className="notes-empty">{failed ? NOTES_FAILED : NOTES_LOADING}</p>
		) : notes.length === 0 ? (
			<p className="notes-empty">{NOTES_EMPTY}</p>
		) : (
			<div className="notes-content">
				<NotesBody blocks={notes} />
			</div>
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
					tabIndex={-1}
					ref={panelRef}
					onKeyDown={onKeyDown}
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
