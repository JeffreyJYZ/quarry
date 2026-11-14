import type { ServerKind } from "@/lib/lsp/served";
import { useState } from "react";
import type { EditorView } from "@codemirror/view";
import { type FileEdit, lspRename } from "@/lib/project/api";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import { ALL_SERVER_KINDS } from "@/lib/consts/lsp";

import { toLspPosition } from "@/lib/editor/positions";

/** The inline rename: F2 opens it with the identifier under the caret, Enter sends the request. */
export function useRenamePanel(options: {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
	onNotice: { current: ((message: string | null) => void) | null };
	onApplyEdits: { current: ((edits: FileEdit[]) => void) | null };
	runningRef?: { current: ReadonlySet<ServerKind> };
}) {
	const { viewRef, rootRef, pathRef, onNotice, onApplyEdits } = options;
	const runningRef = options.runningRef ?? {
		current: new Set(ALL_SERVER_KINDS),
	};
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");

	const submit = () => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = pathRef.current;
		const kind = servedByRunningServer(currentPath, runningRef.current);
		if (view === null || currentRoot === null || currentPath === null || kind === null) {
			setRenameOpen(false);
			return;
		}
		const name = renameValue.trim();
		setRenameOpen(false);
		if (name === "") return;
		const { line, character } = toLspPosition(view, view.state.selection.main.head);
		// The rename is computed against this document. If it came back after an edit, the ranges
		// describe text that is no longer there.
		const requested = view.state.doc;
		void (async () => {
			let result: FileEdit[] = [];
			try {
				result = await lspRename(
					sessionId(kind, currentRoot),
					currentPath,
					line,
					character,
					name,
				);
			} catch {
				result = [];
			}
			if (result.length === 0) {
				onNotice.current?.("Rename unavailable here");
				return;
			}
			const live = viewRef.current;
			if (live === null || live.state.doc !== requested) {
				onNotice.current?.(
					"The document changed while the rename was computed; nothing was applied.",
				);
				return;
			}
			onApplyEdits.current?.(result);
		})();
	};

	return { renameOpen, setRenameOpen, renameValue, setRenameValue, submit };
}
