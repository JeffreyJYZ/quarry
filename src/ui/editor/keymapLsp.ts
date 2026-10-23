import { completionStatus, moveCompletionSelection } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import type { KeyBinding } from "@codemirror/view";
import {
	type CodeAction,
	type Location,
	lspCodeActions,
	lspDefinition,
	lspReferences,
} from "@/lib/project/api";
import { toLspPosition } from "@/lib/editor/positions";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

/** Language-server keys. Live values come through refs, so bindings are built once per editor. */
export function lspBindings(deps: KeymapDeps): KeyBinding[] {
	return [
		{
			key: "ArrowUp",
			run: (currentView) =>
				completionStatus(currentView.state) === "active" &&
				moveCompletionSelection(false)(currentView),
		},
		...defaultKeymap,
		...historyKeymap,
		indentWithTab,
		{
			key: "F12",
			run: () => {
				const currentView = deps.viewRef.current;
				if (currentView === null) return false;
				const currentRoot = deps.rootRef.current;
				const currentPath = deps.latestRef.current.path;
				if (currentRoot === null || currentPath === null) return false;
				const callback = deps.navigateRef.current;
				if (callback === null) return false;
				const pos = currentView.state.selection.main.head;
				const { line, character } = toLspPosition(currentView, pos);
				const mySeq = ++deps.navSeqRef.current;
				void (async () => {
					let locations: Location[] = [];
					try {
						locations = await lspDefinition(currentRoot, currentPath, line, character);
					} catch {
						locations = [];
					}
					if (mySeq !== deps.navSeqRef.current) return;
					if (locations.length === 0) return;
					const first = locations[0];
					callback(first.path, first.range.start.line, first.range.start.character);
				})();
				return true;
			},
		},
		{
			key: "Shift-F12",
			run: () => {
				const currentView = deps.viewRef.current;
				if (currentView === null) return false;
				const currentRoot = deps.rootRef.current;
				const currentPath = deps.latestRef.current.path;
				if (currentRoot === null || currentPath === null) return false;
				const callback = deps.referencesRef.current;
				if (callback === null) return false;
				const pos = currentView.state.selection.main.head;
				const { line, character } = toLspPosition(currentView, pos);
				const mySeq = ++deps.navSeqRef.current;
				void (async () => {
					let locations: Location[] = [];
					try {
						locations = await lspReferences(currentRoot, currentPath, line, character);
					} catch {
						locations = [];
					}
					if (mySeq !== deps.navSeqRef.current) return;
					callback(locations);
				})();
				return true;
			},
		},
		{
			key: "Mod-f",
			run: () => {
				deps.openSearchRef.current(false);
				return true;
			},
		},
		{
			key: "Mod-Alt-f",
			run: () => {
				deps.openSearchRef.current(true);
				return true;
			},
		},
		{
			key: "Mod-g",
			run: () => {
				if (!deps.searchOpenRef.current) return false;
				deps.stepRef.current(1);
				return true;
			},
		},
		{
			key: "F2",
			run: () => {
				const view = deps.viewRef.current;
				if (view === null) return false;
				const pos = view.state.selection.main.head;
				let ident = "";
				// find identifier containing pos
				const line = view.state.doc.lineAt(pos);
				const rel = pos - line.from;
				const before = line.text.slice(0, rel).match(/[A-Za-z0-9_]*$/)?.[0] ?? "";
				const after = line.text.slice(rel).match(/^[A-Za-z0-9_]*/)?.[0] ?? "";
				ident = before + after;
				deps.setRenameValue(ident);
				deps.setRenameOpen(true);
				return true;
			},
		},
		{
			key: "Alt-Enter",
			run: () => {
				const view = deps.viewRef.current;
				if (view === null) return false;
				const currentRoot = deps.rootRef.current;
				const currentPath = deps.latestRef.current.path;
				if (currentRoot === null || currentPath === null) return false;
				const { line, character } = toLspPosition(view, view.state.selection.main.head);
				void (async () => {
					let actions: CodeAction[] = [];
					try {
						actions = await lspCodeActions(currentRoot, currentPath, line, character);
					} catch {
						actions = [];
					}
					if (actions.length === 0) {
						deps.setCodeMenuOpen(false);
						deps.setCodeActions([]);
						return;
					}
					deps.setCodeActions(actions);
					deps.setCodeMenuOpen(true);
				})();
				return true;
			},
		},
		{
			key: "Mod-Shift-Space",
			run: () => {
				void deps.runSig();
				return true;
			},
		},
		{
			key: "Mod-Alt-i",
			run: () => {
				deps.toggleHints();
				return true;
			},
		},
	];
}
