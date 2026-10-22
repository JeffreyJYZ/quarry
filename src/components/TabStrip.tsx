import { useEffect } from "react";
import { type FileBuffer, isDirty } from "@/project/buffer";

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
}: TabStripProps) {
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
		<div className="tabstrip">
			{buffers.map((buffer) => {
				const active = buffer.path === activePath;
				const confirming = buffer.path === confirmClose;
				const pending = saving.has(buffer.path);
				const rowClass = ["tab", active ? "active" : "", confirming ? "confirming" : ""]
					.filter((part) => part !== "")
					.join(" ");

				return (
					<div key={buffer.path} className={rowClass}>
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
									className="tab-name"
									title={buffer.path}
									onClick={() => onActivate(buffer.path)}
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
	);
}
