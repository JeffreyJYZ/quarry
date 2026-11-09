import { historyField } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";

/**
 * CodeMirror state, flattened to something a cache can hold.
 *
 * `toJSON()` alone keeps only the document and the selection. The undo history is a state field, so
 * it is named explicitly on the way out and on the way back in; without both halves a restored view
 * would keep the caret and lose the thing a tab switch is really about.
 */

export type SerializedEditorState = { doc: string; [field: string]: unknown };

export function snapshotState(state: EditorState): SerializedEditorState {
	return state.toJSON({ history: historyField }) as SerializedEditorState;
}

/**
 * The state described by `snapshot`, over `extensions`, or `null` when it cannot be read.
 *
 * The extensions are the caller's, never the snapshot's: facets such as the language and the indent
 * unit are configuration, not document state, so a remount gets what the app currently wants rather
 * than what the file was opened with. A snapshot that no longer parses is a miss, not a crash.
 */
export function stateFromSnapshot(snapshot: unknown, extensions: Extension): EditorState | null {
	try {
		return EditorState.fromJSON(snapshot, { extensions }, { history: historyField });
	} catch {
		return null;
	}
}
