import { useCallback, useEffect, useRef } from "react";
import { isDirty, type FileBuffer } from "@/lib/project/buffer";
import { type SaveOutcome, saveBuffer, saveErrorMessage, saveMessage } from "@/lib/project/save";
import { lspDidSave } from "@/lib/project/api";
import type { EditorHandle } from "@/ui/editor/Editor";
import type { StatusText } from "@/ui/app/status";

const SAVE_STATUS_MS = 2500;

export type SaveContext = {
	root: string | null;
	activePath: string | null;
	formatting: boolean;
	buffersRef: React.RefObject<FileBuffer[]>;
	activePathRef: React.RefObject<string | null>;
	editorRef: React.RefObject<EditorHandle | null>;
	formatOnSaveRef: React.RefObject<boolean>;
	setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
	setSaving: (updater: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;
	setSaveStatus: (status: StatusText | null) => void;
	setFormatting: (value: boolean) => void;
	onSaved: (path: string) => void;
	onBatchSaved: () => void;
};

/**
 * Saving buffers: one path, all dirty paths, and the save-then-format sequence.
 *
 * Format-on-save rewrites the text before the write, so the file on disk is the formatted one and a
 * second save is never needed to land the formatter's edits.
 */
export function useSaveBuffers(context: SaveContext) {
	const {
		root,
		activePath,
		formatting,
		buffersRef,
		activePathRef,
		editorRef,
		formatOnSaveRef,
		setBuffers,
		setSaving,
		setSaveStatus,
		setFormatting,
	} = context;
	const saveTimer = useRef<number | null>(null);

	const showSaveStatus = useCallback(
		(status: StatusText) => {
			setSaveStatus(status);
			if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
			saveTimer.current = window.setTimeout(() => {
				saveTimer.current = null;
				setSaveStatus(null);
			}, SAVE_STATUS_MS);
		},
		[setSaveStatus],
	);

	useEffect(
		() => () => {
			if (saveTimer.current !== null) {
				window.clearTimeout(saveTimer.current);
				saveTimer.current = null;
			}
		},
		[],
	);

	/** Writes the paths in order, stopping at the first failure; the failed row reports itself. */
	const savePaths = useCallback(
		async (paths: string[]): Promise<boolean> => {
			if (root === null) return false;
			let saved = 0;
			let warned = false;
			for (const path of paths) {
				const found = buffersRef.current.find((entry) => entry.path === path);
				if (!found) continue;
				let buffer = found;
				if (formatOnSaveRef.current && path === activePathRef.current) {
					const formatted = await editorRef.current?.formatText();
					if (
						formatted !== null &&
						formatted !== undefined &&
						formatted !== buffer.text
					) {
						buffer = { ...buffer, text: formatted };
						const next: FileBuffer = buffer;
						setBuffers((current) =>
							current.map((entry) => (entry.path === path ? next : entry)),
						);
					}
				}
				setSaving((current) => new Set(current).add(path));
				try {
					let outcome: SaveOutcome;
					try {
						outcome = await saveBuffer(root, buffer);
					} catch (error) {
						showSaveStatus({
							text: saveErrorMessage(buffer.name, error),
							failed: true,
						});
						return false;
					}
					const written = outcome.buffer;
					setBuffers((current) =>
						current.map((entry) => (entry.path === path ? written : entry)),
					);
					saved += 1;
					context.onSaved(path);
					if (outcome.warning !== null) warned = true;
					showSaveStatus({
						text: saveMessage(written.name, outcome.warning),
						failed: false,
					});
					// The checker runs on save; without this the server never re-analyses.
					void lspDidSave(root, path).catch(() => {
						/* a server that is not running has nothing to tell */
					});
				} finally {
					setSaving((current) => {
						const next = new Set(current);
						next.delete(path);
						return next;
					});
				}
			}
			if (saved > 0) context.onBatchSaved();
			if (saved > 1 && !warned)
				showSaveStatus({ text: `Saved ${saved} files`, failed: false });
			return saved === paths.length;
		},
		[
			root,
			buffersRef,
			activePathRef,
			editorRef,
			formatOnSaveRef,
			setBuffers,
			setSaving,
			showSaveStatus,
			context,
		],
	);

	const saveActive = useCallback(() => {
		const path = activePathRef.current;
		return savePaths(path === null ? [] : [path]);
	}, [savePaths, activePathRef]);

	const saveAll = useCallback(
		() =>
			savePaths(
				buffersRef.current.filter((buffer) => isDirty(buffer)).map((buffer) => buffer.path),
			),
		[savePaths, buffersRef],
	);

	const formatActive = useCallback(async () => {
		if (root === null || activePath === null || formatting) return;
		setFormatting(true);
		try {
			await editorRef.current?.format();
		} finally {
			setFormatting(false);
		}
	}, [root, activePath, formatting, editorRef, setFormatting]);

	return { savePaths, saveActive, saveAll, formatActive, showSaveStatus };
}
