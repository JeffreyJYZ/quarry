import { autocompletion } from "@codemirror/autocomplete";
import { EditorView, hoverTooltip } from "@codemirror/view";
import { kindToType } from "@/lib/editor/completion";
import { toLspPosition } from "@/lib/editor/positions";
import { renderMarkdown } from "@/lib/editor/markdown";
import { type Location, lspCompletion, lspDefinition, lspHover } from "@/lib/project/api";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

export type BehaviourDeps = KeymapDeps & {
	recomputeRef: { current: () => void };
	scheduleSig: () => void;
	scheduleOccurrences: () => void;
	inlayTimerRef: { current: number | null };
	runInlay: () => Promise<void>;
	onCursorRef: { current: ((position: { line: number; character: number }) => void) | null };
	lastCursorRef: { current: { line: number; character: number } | null };
	completionSeq: number;
	hoverSeq: number;
};

/** The editor's own event handlers: document changes, blur, cmd-click, completion and hover. */
export function behaviourExtensions(deps: BehaviourDeps) {
	return [
		EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				let typed = false;
				update.changes.iterChanges((_from, _to, inserted) => {
					const text = inserted.toString();
					if (text === "(" || text === ",") typed = true;
				});
				const next = update.state.doc.toString();
				if (next !== deps.latestRef.current.value) {
					deps.latestRef.current.onChange(next);
					if (deps.searchOpenRef.current) {
						window.setTimeout(() => deps.recomputeRef.current(), 0);
					}
				}
				if (typed) deps.scheduleSig();
				if (deps.inlayTimerRef.current !== null)
					window.clearTimeout(deps.inlayTimerRef.current);
				deps.inlayTimerRef.current = window.setTimeout(() => {
					deps.inlayTimerRef.current = null;
					void deps.runInlay();
				}, 600);
				deps.occSeqRef.current += 1;
				if (deps.occTimerRef.current !== null) {
					window.clearTimeout(deps.occTimerRef.current);
					deps.occTimerRef.current = null;
				}
				deps.clearOccurrences();
			}
			if (update.selectionSet) {
				deps.scheduleSig();
				deps.scheduleOccurrences();
				const pos = update.state.selection.main.head;
				const { line, character } = toLspPosition(update.view, pos);
				const last = deps.lastCursorRef.current;
				if (last === null || last.line !== line || last.character !== character) {
					deps.lastCursorRef.current = { line, character };
					deps.onCursorRef.current?.({ line, character });
				}
			}
		}),
		EditorView.domEventHandlers({
			blur: () => {
				deps.hideSig();
				deps.occSeqRef.current += 1;
				if (deps.occTimerRef.current !== null) {
					window.clearTimeout(deps.occTimerRef.current);
					deps.occTimerRef.current = null;
				}
				deps.clearOccurrences();
				return false;
			},
			mousedown: (event, view) => {
				if (!(event.metaKey || event.ctrlKey)) return false;
				const currentRoot = deps.rootRef.current;
				const currentPath = deps.latestRef.current.path;
				const callback = deps.navigateRef.current;
				if (currentRoot === null || currentPath === null || callback === null) return false;
				const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) return false;
				const { line, character } = toLspPosition(view, pos);
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
				return false;
			},
		}),
		autocompletion({
			defaultKeymap: false,
			override: [
				async (context) => {
					const currentRoot = deps.rootRef.current;
					const currentPath = deps.latestRef.current.path;
					if (currentRoot === null || currentPath === null) return null;
					if (!context.explicit && context.matchBefore(/[\w:.]+/) === null) {
						return null;
					}
					const mySeq = ++deps.completionSeq;
					const completionView = context.view;
					if (completionView === undefined) return null;
					const { line, character } = toLspPosition(completionView, context.pos);
					let result: Awaited<ReturnType<typeof lspCompletion>>;
					try {
						result = await lspCompletion(currentRoot, currentPath, line, character);
					} catch {
						return null;
					}
					if (mySeq !== deps.completionSeq) return null;
					if (result === null) return null;
					const word = context.matchBefore(/\w*/);
					const from = word === null ? context.pos : word.from;
					const options = result.items.map((item) => ({
						label: item.label,
						detail: item.detail ?? undefined,
						type: kindToType(item.kind),
						apply: item.insertText ?? item.label,
					}));
					return { from, options };
				},
			],
		}),
		hoverTooltip(async (view, pos) => {
			const currentRoot = deps.rootRef.current;
			const currentPath = deps.latestRef.current.path;
			if (currentRoot === null || currentPath === null) return null;
			const mySeq = ++deps.hoverSeq;
			const { line, character } = toLspPosition(view, pos);
			let info: Awaited<ReturnType<typeof lspHover>>;
			try {
				info = await lspHover(currentRoot, currentPath, line, character);
			} catch {
				return null;
			}
			if (mySeq !== deps.hoverSeq) return null;
			if (info === null) return null;
			let tooltipPos = pos;
			let tooltipEnd: number | undefined;
			if (info.range !== null) {
				const startLine = view.state.doc.line(info.range.start.line + 1);
				const endLine = view.state.doc.line(info.range.end.line + 1);
				tooltipPos = startLine.from + info.range.start.character;
				tooltipEnd = endLine.from + info.range.end.character;
			}
			const text = info.contents;
			return {
				pos: tooltipPos,
				end: tooltipEnd,
				create: () => ({ dom: renderMarkdown(text) }),
			};
		}),
	];
}
