/**
 * Which layout toggle a window-level keydown means.
 *
 * The shell and the editor share one keyboard. CodeMirror is a contenteditable surface, so the
 * browser answers `Cmd+B` itself (bold) and the editor's keymaps own `Cmd+D` and `Cmd+G`; those
 * chords must not reach a layout toggle while the caret is in a file. `Cmd+Shift+D` and
 * `Cmd+Shift+G` are claimed by neither an editor binding nor a menu accelerator, so they belong to
 * the shell wherever focus sits — a text field and the terminal are still excluded.
 */

export type LayoutToggle = "rail" | "dock" | "debugger" | "source-control" | "todo";

/** What holds the keyboard, as far as the layout toggles care. */
export type FocusKind = "other" | "editor" | "input" | "terminal";

type Chord = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * Resolve a chord to its layout toggle, or null for every key the shell does not own here.
 *
 * The editor is itself a text field, so it is classified before any input test: only the unshifted
 * pair stands aside there, and the shifted pair is answered from inside a file.
 */
export function resolveLayoutToggle(event: Chord, focus: FocusKind): LayoutToggle | null {
	if (!event.metaKey || event.ctrlKey || event.altKey) return null;
	if (focus === "terminal") return null;
	const key = event.key.toLowerCase();
	if (!event.shiftKey) {
		/* Cmd+6 selects the TODO tool window the way an IDE numbers its tool windows. Nothing else
		   claims it, so it answers from inside a file and from a text field too. */
		if (key === "6") return "todo";
		/* `Cmd+B` is the webview's own bold and `Cmd+J` the text surface's; neither is ours to take. */
		if (focus === "editor" || focus === "input") return null;
		if (key === "b") return "rail";
		if (key === "j") return "dock";
		return null;
	}
	if (focus === "input") return null;
	if (key === "d") return "debugger";
	if (key === "g") return "source-control";
	return null;
}
