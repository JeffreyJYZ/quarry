import { useEffect } from "react";
import { Compartment } from "@codemirror/state";
import { createEditorView } from "@/ui/editor/createEditorView";
import type { BehaviourDeps } from "@/ui/editor/extensionsBehaviour";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";
import type { EditorRefs } from "@/ui/editor/useEditorRefs";

/**
 * Mounts the editor once and tears it down on unmount.
 *
 * The bindings read live values through refs, so a prop change never rebuilds the view; the
 * language, indent width, blame and value each arrive through a compartment or a transaction.
 */
export function useEditorMount(options: {
	refs: EditorRefs;
	deps: KeymapDeps;
	behaviour: BehaviourDeps;
}): void {
	const { refs, deps, behaviour } = options;

	// biome-ignore lint/correctness/useExhaustiveDependencies: the view is built once per mount
	useEffect(() => {
		const host = refs.hostRef.current;
		if (host === null) return;
		const language = new Compartment();
		refs.languageRef.current = language;
		const indentation = new Compartment();
		refs.indentRef.current = indentation;
		const view = createEditorView({
			host,
			language,
			indentation,
			initialValue: refs.latestRef.current.value,
			initialPath: refs.latestRef.current.path,
			tabSize: refs.tabSizeRef.current,
			deps,
			behaviourDeps: behaviour,
		});
		refs.viewRef.current = view;
		return () => {
			refs.viewRef.current = null;
			refs.languageRef.current = null;
			refs.markersRef.current = { view: null, lines: [], unverified: new Set() };
			view.destroy();
		};
	}, []);
}
