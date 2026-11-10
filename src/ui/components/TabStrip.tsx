import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { type FileBuffer, isDirty } from "@/lib/project/buffer";
import { rovingIndex } from "@/lib/tabs/roving";

export type TabStripProps = {
	buffers: FileBuffer[];
	activePath: string | null;
	/** Paths whose write is currently in flight; those rows carry a dimmed mark. */
	saving: ReadonlySet<string>;
	/** Path whose dirty close is waiting on the inline Save/Discard choice. */
	confirmClose: string | null;
	onActivate: (path: string) => void;
	onClose: (path: string) => void;
	onSaveClose: (path: string) => void;
	onDiscardClose: (path: string) => void;
	onCancelClose: () => void;
	/** Open state of the split editor, for the toggle at the row's end. */
	splitOpen?: boolean;
	/** The toggle itself; omitted, the row renders no split button at all. */
	onToggleSplit?: () => void;
};

export default function TabStrip({
	buffers,
	activePath,
	saving,
	confirmClose,
	onActivate,
	onClose,
	onSaveClose,
	onDiscardClose,
	onCancelClose,
	splitOpen = false,
	onToggleSplit,
}: TabStripProps) {
	/** One tab owns the tab stop; the others are reachable with the arrow keys. */
	const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
	const selectedIndex = Math.max(
		0,
		buffers.findIndex((buffer) => buffer.path === activePath),
	);
	const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
		const next = rovingIndex(event.key, selectedIndex, buffers.length);
		if (next === null) return;
		const target = buffers[next];
		if (target === undefined) return;
		event.preventDefault();
		onActivate(target.path);
		tabButtons.current[next]?.focus();
	};

	/** Escape backs out of a pending close, matching the inline choice's own "keep it open". */
	useEffect(() => {
		if (confirmClose === null) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onCancelClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [confirmClose, onCancelClose]);

	return (
		<div className="tabstrip-row">
			<div className="tabstrip" role="tablist" aria-label="Open files">
				{buffers.map((buffer, index) => {
					const active = buffer.path === activePath;
					const confirming = buffer.path === confirmClose;
					const pending = saving.has(buffer.path);
					const rowClass = ["tab", active ? "active" : "", confirming ? "confirming" : ""]
						.filter((part) => part !== "")
						.join(" ");

					return (
						<div key={buffer.path} className={rowClass} role="presentation">
							{confirming ? (
								<>
									<span className="tab-name tab-confirm-name" title={buffer.path}>
										{buffer.name}
									</span>
									<button
										type="button"
										className="tab-choice save"
										disabled={pending}
										onClick={() => onSaveClose(buffer.path)}
									>
										{pending ? "saving" : "Save"}
									</button>
									<button
										type="button"
										className="tab-choice discard"
										disabled={pending}
										onClick={() => onDiscardClose(buffer.path)}
									>
										Discard
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										ref={(node) => {
											tabButtons.current[index] = node;
										}}
										className="tab-name"
										title={buffer.path}
										role="tab"
										aria-selected={active}
										tabIndex={index === selectedIndex ? 0 : -1}
										onClick={() => onActivate(buffer.path)}
										onKeyDown={onTabKeyDown}
									>
										{isDirty(buffer) ? (
											<span className="dirty" title="unsaved changes">
												•
											</span>
										) : null}
										{pending ? (
											<span className="tab-saving" title="saving">
												·
											</span>
										) : null}
										{buffer.name}
									</button>
									<button
										type="button"
										className="tab-close"
										aria-label={`Close ${buffer.name}`}
										onClick={() => onClose(buffer.path)}
									>
										×
									</button>
								</>
							)}
						</div>
					);
				})}
			</div>
			{onToggleSplit === undefined ? null : (
				<button
					type="button"
					className="tabstrip-split"
					aria-label="Split editor right"
					aria-pressed={splitOpen}
					title="Split editor right"
					onClick={onToggleSplit}
				>
					◫
				</button>
			)}
		</div>
	);
}
