import { useState } from "react";
import type { FileBuffer } from "@/lib/project/buffer";
import { bufferLabels } from "@/lib/project/bufferLabels";

export type SplitPickerProps = {
	/** Every open buffer; the left pane's own file is listed but cannot be chosen. */
	buffers: FileBuffer[];
	root: string | null;
	/** The file the split shows now, or null while it shows nothing. */
	currentPath: string | null;
	/** The left pane's file, which the right pane never shows. */
	blockedPath: string | null;
	onPick: (path: string) => void;
};

/**
 * The split header's file picker.
 *
 * It replaces the title, so the pane names the file it holds and changes it from the same control:
 * the old pane could only show the most recently read other buffer, and nothing could point it at a
 * third file. The left pane's own file is refused rather than merely dimmed, because two panes on
 * one buffer is the state this pane exists to avoid.
 */
export default function SplitPicker(props: SplitPickerProps) {
	const { buffers, root, currentPath, blockedPath, onPick } = props;
	const [open, setOpen] = useState(false);
	const labels = bufferLabels(buffers, root);
	const current = labels.find((label) => label.path === currentPath);

	return (
		<div className="split-picker">
			<button
				type="button"
				className="split-picker-button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label="Change the file in the split editor"
				title="Change the file in the split editor"
				onClick={() => setOpen((value) => !value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") setOpen(false);
				}}
			>
				<span className="split-picker-name">{current?.name ?? "choose a file"}</span>
				<span className="split-picker-caret" aria-hidden="true">
					▾
				</span>
			</button>
			{open ? (
				<div className="split-picker-menu" role="listbox" aria-label="Open files">
					{labels.map((label) => {
						const blocked = label.path === blockedPath;
						const active = label.path === currentPath;
						const className = [
							"split-picker-option",
							active ? "active" : "",
							blocked ? "blocked" : "",
						]
							.filter((part) => part !== "")
							.join(" ");
						return (
							<button
								key={label.path}
								type="button"
								role="option"
								className={className}
								aria-selected={active}
								aria-disabled={blocked}
								disabled={blocked}
								title={label.path}
								onClick={() => {
									if (blocked) return;
									onPick(label.path);
									setOpen(false);
								}}
							>
								<span className="split-picker-option-name">{label.name}</span>
								{label.folder === null ? null : (
									<span className="split-picker-option-folder">
										{label.folder}
									</span>
								)}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
