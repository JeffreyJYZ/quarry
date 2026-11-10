import {
	bracketMatching,
	codeFolding,
	foldGutter,
	indentOnInput,
	indentUnit,
	syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { type Compartment, EditorState, type Extension } from "@codemirror/state";
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
import { bookmarkGutter } from "@/lib/bookmarks/gutter";
import { breakpointGutter } from "@/lib/editor/breakpoints";
import { cppEditing } from "@/lib/editor/cppEditing";
import { inlayHintsField } from "@/lib/editor/inlayHints";
import { languageForPath } from "@/lib/editor/languages";
import { occurrencesField } from "@/lib/editor/occurrences";
import { searchDecorations, searchField } from "@/lib/editor/search";
import { quarryTheme } from "@/lib/editor/theme";
import { quarryHighlightStyle } from "@/lib/editor/themeSyntax";
import { semanticTokens } from "@/lib/editor/semanticTokens";
import { stateFromSnapshot } from "@/lib/editor/stateSnapshot";
import { type BehaviourDeps, behaviourExtensions } from "@/ui/editor/extensionsBehaviour";
import { bookmarkBindings } from "@/ui/editor/keymapBookmarks";
import { completionBindings } from "@/ui/editor/keymapCompletion";
import { debugBindings } from "@/ui/editor/keymapDebug";
import { editingBindings } from "@/ui/editor/keymapEditing";
import { lspBindings } from "@/ui/editor/keymapLsp";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/**
 * One `EditorView` for the surface's lifetime.
 *
 * Everything that can change arrives through a compartment or a ref; the extensions are built once,
 * which is what keeps typing from rebuilding the keymap or the language.
 *
 * `restore` is a state saved by a previous mount of the same document: the same extensions are
 * applied to it, so the compartments start at the current configuration and the mount effects that
 * push a prop in (language, indent, blame) still run afterwards. A snapshot that cannot be read
 * leaves an ordinary fresh state.
 */
export function createEditorView(options: {
	host: HTMLDivElement;
	language: Compartment;
	indentation: Compartment;
	/** Holds the test column; empty until the file has markers to draw. */
	testGutter: Compartment;
	/** Holds the TODO column; empty until the file carries a marker. */
	todoGutter: Compartment;
	initialValue: string;
	initialPath: string | null;
	tabSize: number;
	deps: KeymapDeps;
	behaviourDeps: BehaviourDeps;
	restore: unknown | null;
}): EditorView {
	const { host, language, indentation, initialValue, initialPath, tabSize } = options;
	const extensions: Extension = [
		bookmarkGutter,
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
		cppEditing(),
		codeFolding(),
		foldGutter(),
		indentation.of([indentUnit.of(" ".repeat(tabSize)), EditorState.tabSize.of(tabSize)]),
		options.testGutter.of([]),
		options.todoGutter.of([]),
		keymap.of([
			...completionBindings(options.deps),
			...lspBindings(options.deps),
			...editingBindings(options.deps),
			...debugBindings(options.deps),
			...bookmarkBindings(options.deps),
		]),
		language.of(languageForPath(initialPath)),
		quarryTheme,
		syntaxHighlighting(quarryHighlightStyle),
		semanticTokens({
			pathRef: {
				get current() {
					return options.deps.latestRef.current.path;
				},
			},
			enabled: true,
		}),
		EditorView.contentAttributes.of({ "aria-label": "Editor", spellcheck: "false" }),
		...behaviourExtensions(options.behaviourDeps),
	];
	const restored =
		options.restore === null ? null : stateFromSnapshot(options.restore, extensions);
	return new EditorView({
		parent: host,
		state: restored ?? EditorState.create({ doc: initialValue, extensions }),
	});
}
