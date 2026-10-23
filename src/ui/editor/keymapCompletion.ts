import { expandBracketPair } from "@/lib/editor/commands";
import {
	acceptCompletion,
	closeCompletion,
	completionStatus,
	moveCompletionSelection,
	startCompletion,
} from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import type { KeyBinding } from "@codemirror/view";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/** The completion popup's keys, plus Mod-Space to ask for completions explicitly. */
export function completionBindings(_deps: KeymapDeps): KeyBinding[] {
	return [
		{
			key: "Enter",
			run: (currentView) =>
				expandBracketPair(currentView) || insertNewlineAndIndent(currentView),
		},
		{
			key: "Tab",
			run: (currentView) =>
				completionStatus(currentView.state) === "active" && acceptCompletion(currentView),
		},
		{
			key: "Escape",
			run: (currentView) =>
				completionStatus(currentView.state) === "active" && closeCompletion(currentView),
		},
		{
			key: "Mod-Space",
			run: (currentView) => startCompletion(currentView),
		},
		{
			key: "ArrowDown",
			run: (currentView) =>
				completionStatus(currentView.state) === "active" &&
				moveCompletionSelection(true)(currentView),
		},
	];
}
