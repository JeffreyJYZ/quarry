import type { KeyBinding } from "@codemirror/view";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/**
 * Toggling a bookmark from the caret.
 *
 * `Mod-Alt-K` is deliberately not a menu accelerator: the native menu is built in Rust, and a chord
 * it owns is delivered to the menu before the webview ever sees the keydown. No menu item, no
 * in-app binding and no system shortcut claims this chord, so the editor receives it first.
 */
export function bookmarkBindings(deps: Pick<KeymapDeps, "toggleBookmarkRef">): KeyBinding[] {
	return [
		{
			key: "Mod-Alt-k",
			run: (view) => {
				const toggle = deps.toggleBookmarkRef.current;
				if (toggle === null) return false;
				toggle(view.state.doc.lineAt(view.state.selection.main.head).number);
				return true;
			},
		},
	];
}
