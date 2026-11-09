import type { KeyBinding } from "@codemirror/view";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/** What the debugger answers to: the three step moves, continue, and the breakpoint toggle. */
export type DebugKey = "stepIn" | "next" | "stepOut" | "continue" | "toggleBreakpoint";

type Chord = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * Which debugger action a keydown means, or null for every other key.
 *
 * `Cmd+F8` is resolved before the step keys so no step branch can claim a modified chord: the shell
 * handler used to test `event.key === "F8"` alone and sent `Cmd+F8` into step-over while a session
 * was live. Step keys exist only during a session and take no modifier, apart from `Shift+F8`.
 */
export function resolveDebugKey(event: Chord, live: boolean): DebugKey | null {
	const mod = event.metaKey || event.ctrlKey;
	if (mod && !event.altKey && event.key.toLowerCase() === "f8") return "toggleBreakpoint";
	if (!live || mod || event.altKey) return null;
	if (event.key === "F7" && !event.shiftKey) return "stepIn";
	if (event.key === "F8") return event.shiftKey ? "stepOut" : "next";
	if (event.key === "F9" && !event.shiftKey) return "continue";
	return null;
}

/**
 * The one debugger chord that has to work from inside the editor.
 *
 * The shell's keymap ignores keys while CodeMirror owns focus — its content is an editable target —
 * so `Cmd+F8` needs a binding on the editor itself. The line is the caret's 1-based line, and the
 * toggle arrives as a ref because the view is built once.
 */
export function debugBindings(deps: Pick<KeymapDeps, "toggleBreakpointRef">): KeyBinding[] {
	return [
		{
			key: "Mod-F8",
			run: (view) => {
				const toggle = deps.toggleBreakpointRef.current;
				if (toggle === null) return false;
				toggle(view.state.doc.lineAt(view.state.selection.main.head).number);
				return true;
			},
		},
	];
}
