import { useState } from "react";
import PresetRow from "@/ui/debug/PresetRow";
import {
	type DraftPreset,
	toDraftPreset,
	toLaunchPreset,
	validateLaunchFile,
} from "@/lib/debug/presets";
import type { DebugController } from "@/lib/debug/session";
import { readLaunchConfig, writeLaunchConfig } from "@/lib/project/api";

/**
 * The launch-config editor: local drafts, so closing without saving changes nothing on disk.
 * The panel mounts it only while it is open, which is what re-seeds the drafts on each open.
 */
export default function PresetsEditor({
	debug,
	onClose,
}: {
	debug: DebugController;
	onClose: () => void;
}) {
	const [drafts, setDrafts] = useState<DraftPreset[]>(() => debug.presets.map(toDraftPreset));
	const [saveError, setSaveError] = useState<string | null>(null);
	const [discardConfirm, setDiscardConfirm] = useState(false);

	function patch(index: number, changes: Partial<DraftPreset>) {
		setDrafts(drafts.map((draft, at) => (at === index ? { ...draft, ...changes } : draft)));
	}

	function swap(from: number, to: number) {
		if (to < 0 || to >= drafts.length) return;
		const next = [...drafts];
		[next[from], next[to]] = [next[to], next[from]];
		setDrafts(next);
	}

	function remove(index: number) {
		setDrafts(drafts.filter((_, at) => at !== index));
	}

	function duplicate(index: number) {
		const next = [...drafts];
		next.splice(index + 1, 0, { ...drafts[index] });
		setDrafts(next);
	}

	async function saveEditor() {
		if (debug.root === null) return;
		const file = { configurations: drafts.map(toLaunchPreset) };
		const validationError = validateLaunchFile(
			file as { configurations: Array<Record<string, unknown>> },
		);
		if (validationError !== null) {
			setSaveError(validationError);
			return;
		}
		try {
			await writeLaunchConfig(
				debug.root,
				file as { configurations: ReturnType<typeof toLaunchPreset>[] },
			);
			await readLaunchConfig(debug.root);
			await debug.refreshPresets();
			onClose();
			setSaveError(null);
		} catch (reason) {
			setSaveError(String(reason));
		}
	}

	return (
		<section
			className="debug-section"
			role="region"
			tabIndex={-1}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					setDiscardConfirm(true);
				}
			}}
		>
			<div className="debug-section-head">
				<span className="label">configurations</span>
			</div>
			{drafts.map((draft, index) => (
				<PresetRow
					// biome-ignore lint/suspicious/noArrayIndexKey: a configuration row is identified by its position while it is being edited
					key={`${draft.name}-${index}`}
					draft={draft}
					onChange={(changes) => patch(index, changes)}
					onMoveUp={() => swap(index, index - 1)}
					onMoveDown={() => swap(index, index + 1)}
					onRemove={() => remove(index)}
					onDuplicate={() => duplicate(index)}
				/>
			))}
			<div className="debug-row">
				<button
					type="button"
					className="button"
					onClick={() =>
						setDrafts([
							...drafts,
							{
								name: "",
								program: "",
								args: "",
								cwd: "",
								build: "",
								stopOnEntry: false,
								initCommands: "",
							},
						])
					}
				>
					Add configuration
				</button>
				<button type="button" className="button" onClick={() => void saveEditor()}>
					Save
				</button>
				<button type="button" className="button" onClick={() => setDiscardConfirm(true)}>
					Close
				</button>
			</div>
			{saveError === null ? null : <p className="debug-error">{saveError}</p>}
			{discardConfirm ? (
				<div className="debug-row">
					<span>Discard unsaved configuration edits?</span>
					<button type="button" className="button" onClick={onClose}>
						Discard
					</button>
					<button
						type="button"
						className="button"
						onClick={() => setDiscardConfirm(false)}
					>
						Keep editing
					</button>
				</div>
			) : null}
		</section>
	);
}
