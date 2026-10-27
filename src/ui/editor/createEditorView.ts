import {
	bracketMatching,
	codeFolding,
	foldGutter,
	indentOnInput,
	indentUnit,
	syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { type Compartment, EditorState } from "@codemirror/state";
import {
	EditorView,
	drawSelection,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { closeBrackets } from "@codemirror/autocomplete";
import { history } from "@codemirror/commands";
import { blameField } from "@/lib/editor/blame";
import { breakpointGutter } from "@/lib/editor/breakpoints";
import { inlayHintsField } from "@/lib/editor/inlayHints";
import { languageForPath } from "@/lib/editor/languages";
import { occurrencesField } from "@/lib/editor/occurrences";
import { searchDecorations, searchField } from "@/lib/editor/search";
import { quarryTheme } from "@/lib/editor/theme";
import { quarryHighlightStyle } from "@/lib/editor/themeSyntax";
import { type BehaviourDeps, behaviourExtensions } from "@/ui/editor/extensionsBehaviour";
import { completionBindings } from "@/ui/editor/keymapCompletion";
import { editingBindings } from "@/ui/editor/keymapEditing";
import { lspBindings } from "@/ui/editor/keymapLsp";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/**
 * One `EditorView` for the surface's lifetime.
 *
 * Everything that can change arrives through a compartment or a ref; the extensions are built once,
 * which is what keeps typing from rebuilding the keymap or the language.
 */
export function createEditorView(options: {
	host: HTMLDivElement;
	language: Compartment;
	indentation: Compartment;
	initialValue: string;
	initialPath: string | null;
	tabSize: number;
	deps: KeymapDeps;
	behaviourDeps: BehaviourDeps;
}): EditorView {
	const { host, language, indentation, initialValue, initialPath, tabSize } = options;
	return new EditorView({
		parent: host,
		state: EditorState.create({
			doc: initialValue,
			extensions: [
				breakpointGutter,
				searchField,
				searchDecorations,
				inlayHintsField,
				occurrencesField,
				blameField,
				lineNumbers(),
				lintGutter(),
				highlightActiveLineGutter(),
				highlightActiveLine(),
				drawSelection(),
				history(),
				bracketMatching(),
				closeBrackets(),
				indentOnInput(),
				codeFolding(),
				foldGutter(),
				indentation.of([
					indentUnit.of(" ".repeat(tabSize)),
					EditorState.tabSize.of(tabSize),
				]),
				keymap.of([
					...completionBindings(options.deps),
					...lspBindings(options.deps),
					...editingBindings(options.deps),
				]),
				language.of(languageForPath(initialPath)),
				quarryTheme,
				syntaxHighlighting(quarryHighlightStyle),
				EditorView.contentAttributes.of({ "aria-label": "Editor", spellcheck: "false" }),
				...behaviourExtensions(options.behaviourDeps),
			],
		}),
	});
}
