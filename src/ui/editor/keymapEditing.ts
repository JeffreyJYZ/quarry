import {
	cursorMatchingBracket,
	deleteLine,
	indentLess,
	indentSelection,
	toggleLineComment,
} from "@codemirror/commands";
import { foldAll, foldCode, unfoldAll, unfoldCode } from "@codemirror/language";
import { EditorSelection } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { foldLevel } from "@/lib/editor/commands";
import { occurrenceStarts } from "@/lib/editor/occurrences";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/**
 * The editing keys: multi-cursor, line comment, folding, indent, and the search sheet's own keys.
 */
export function editingBindings(deps: KeymapDeps): KeyBinding[] {
	return [
		{
			key: "Escape",
			run: () => {
				if (deps.renameOpen) {
					deps.setRenameOpen(false);
					return true;
				}
				if (deps.codeMenuOpen) {
					deps.setCodeMenuOpen(false);
					return true;
				}
				deps.hideSig();
				deps.occSeqRef.current += 1;
				if (deps.occTimerRef.current !== null) {
					window.clearTimeout(deps.occTimerRef.current);
					deps.occTimerRef.current = null;
				}
				deps.clearOccurrences();
				if (!deps.searchOpenRef.current) return false;
				deps.closeSearchRef.current();
				return true;
			},
		},
		{
			key: "Mod-]",
			run: (view) => {
				indentSelection(view);
				return true;
			},
		},
		{
			key: "Mod-[",
			run: (view) => {
				indentLess(view);
				return true;
			},
		},
		{
			key: "Mod-/",
			run: toggleLineComment,
		},
		{
			key: "Mod-d",
			run: (view) => {
				const state = view.state;
				const sel = state.selection;
				const main = sel.main;
				let word = "";
				let from = main.from;
				let to = main.to;
				if (main.empty) {
					const line = state.doc.lineAt(main.head);
					const text = line.text;
					const rel = main.head - line.from;
					let start = rel;
					let end = rel;
					while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start -= 1;
					while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
					from = line.from + start;
					to = line.from + end;
					if (from === to) return false;
					deps.occurrenceHistoryRef.current.push(sel);
					view.dispatch({ selection: { anchor: from, head: to } });
					return true;
				}
				word = state.doc.sliceString(from, to);
				if (word === "") return false;
				const doc = state.doc.toString();
				const selected = new Set(sel.ranges.map((r) => r.from));
				const searchStart = Math.max(...sel.ranges.map((r) => r.to));
				let pos = doc.indexOf(word, searchStart);
				if (pos === -1) pos = doc.indexOf(word, 0);
				while (pos !== -1 && selected.has(pos)) {
					const next = doc.indexOf(word, pos + 1);
					if (next === -1 || next === pos) {
						pos = doc.indexOf(word, 0);
						if (selected.has(pos)) pos = -1;
						break;
					}
					pos = next;
				}
				if (pos === -1 || selected.has(pos)) return false;
				deps.occurrenceHistoryRef.current.push(sel);
				const ranges = [...sel.ranges, EditorSelection.range(pos, pos + word.length)];
				view.dispatch({
					selection: EditorSelection.create(ranges, sel.mainIndex),
				});
				return true;
			},
		},
		{
			key: "Mod-Shift-l",
			run: (view) => {
				const state = view.state;
				const sel = state.selection;
				const main = sel.main;
				let from = main.from;
				let to = main.to;
				let word = "";
				if (main.empty) {
					const line = state.doc.lineAt(main.head);
					const text = line.text;
					const rel = main.head - line.from;
					let start = rel;
					let end = rel;
					while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start -= 1;
					while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
					from = line.from + start;
					to = line.from + end;
					if (from === to) return false;
					word = state.doc.sliceString(from, to);
				} else {
					word = state.doc.sliceString(from, to);
				}
				if (word === "") return false;
				const doc = state.doc.toString();
				const positions = occurrenceStarts(doc, word);
				if (positions.length === 0) return false;
				deps.occurrenceHistoryRef.current.push(sel);
				const ranges = positions.map((p) => EditorSelection.range(p, p + word.length));
				view.dispatch({ selection: EditorSelection.create(ranges, 0) });
				return true;
			},
		},
		{
			key: "Mod-u",
			run: (view) => {
				const stack = deps.occurrenceHistoryRef.current;
				const previous = stack.pop();
				if (previous === undefined) return false;
				view.dispatch({ selection: previous });
				return true;
			},
		},
		{
			key: "Mod-Shift-k",
			run: deleteLine,
		},
		{
			key: "Mod-Shift-[",
			run: foldCode,
		},
		{
			key: "Mod-Shift-]",
			run: unfoldCode,
		},
		{
			key: "Mod-Alt-[",
			run: foldAll,
		},
		{
			key: "Mod-Alt-]",
			run: unfoldAll,
		},
		{
			key: "Mod-Alt-1",
			run: (view) => foldLevel(view, 1),
		},
		{
			key: "Mod-Alt-2",
			run: (view) => foldLevel(view, 2),
		},
		{
			key: "Mod-Alt-3",
			run: (view) => foldLevel(view, 3),
		},
		{
			key: "Mod-Shift-\\\\",
			run: cursorMatchingBracket,
		},
	];
}
