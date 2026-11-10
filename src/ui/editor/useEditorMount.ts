import { useEffect } from "react";
import { Compartment } from "@codemirror/state";
import { documentCache, restoreDocument, saveDocument } from "@/lib/editor/documentCache";
import { snapshotState } from "@/lib/editor/stateSnapshot";
import type { TestMarker } from "@/lib/tests/gutter";
import { createEditorView } from "@/ui/editor/createEditorView";
import { useTestGutter } from "@/ui/editor/useTestGutter";
import type { BehaviourDeps } from "@/ui/editor/extensionsBehaviour";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";

/**
 * Mounts the editor once and tears it down on unmount.
 *
 * The bindings read live values through refs, so a prop change never rebuilds the view; the
 * language, indent width, blame and value each arrive through a compartment or a transaction.
 *
 * The document's state does not die with the view: unmounting saves it under `documentId` and a
 * later mount of that same id restores it, which is what keeps undo, the selection and the scroll
 * position across a tab switch. A reload bumps the load id, so its new document id misses the cache
 * and starts empty — the one case where the old history must not be inherited.
 */
export function useEditorMount(options: {
	refs: EditorRefs;
	deps: KeymapDeps;
	behaviour: BehaviourDeps;
	documentId: string | null;
	testMarkers: readonly TestMarker[];
}): void {
	const { refs, deps, behaviour, documentId } = options;

	// biome-ignore lint/correctness/useExhaustiveDependencies: the view is built once per mount
	useEffect(() => {
		const host = refs.hostRef.current;
		if (host === null) return;
		const language = new Compartment();
		refs.languageRef.current = language;
		const indentation = new Compartment();
		refs.indentRef.current = indentation;
		const testGutter = new Compartment();
		refs.testGutterRef.current = testGutter;
		const value = refs.latestRef.current.value;
		const saved =
			documentId === null ? null : restoreDocument(documentCache, documentId, value);
		const view = createEditorView({
			host,
			language,
			indentation,
			testGutter,
			initialValue: value,
			initialPath: refs.latestRef.current.path,
			tabSize: refs.tabSizeRef.current,
			deps,
			behaviourDeps: behaviour,
			restore: saved === null ? null : saved.state,
		});
		if (saved !== null) {
			view.scrollDOM.scrollTop = saved.scrollTop;
			view.scrollDOM.scrollLeft = saved.scrollLeft;
		}
		refs.viewRef.current = view;
		return () => {
			refs.viewRef.current = null;
			refs.languageRef.current = null;
			refs.testGutterRef.current = null;
			refs.testMarkersRef.current = "";
			refs.markersRef.current = { view: null, lines: [], unverified: new Set() };
			if (documentId !== null) {
				saveDocument(documentCache, documentId, {
					path: refs.latestRef.current.path ?? "",
					doc: view.state.doc.toString(),
					state: snapshotState(view.state),
					scrollTop: view.scrollDOM.scrollTop,
					scrollLeft: view.scrollDOM.scrollLeft,
				});
			}
			view.destroy();
		};
	}, []);

	// After the mount effect, so the first set of markers lands in a view that exists.
	useTestGutter(refs, options.testMarkers);
}
