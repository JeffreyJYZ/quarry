import { type MutableRefObject, useCallback, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { MenuItem } from "@/ui/components/ContextMenu";

type MenuState = { x: number; y: number; line: number; hasSelection: boolean };

/** Just enough of a pointer event to place the menu: a React one and a native one both fit. */
type PointerEvent = { preventDefault: () => void; clientX: number; clientY: number };

/**
 * The editor's right-click menu: clipboard, breakpoint, format.
 *
 * CodeMirror has no menu of its own and the browser's native one offers nothing about code —
 * "Inspect" and "Reload". The handler sits on the host element rather than inside a CodeMirror
 * extension, so the menu costs the view no state and stays ordinary React.
 *
 * Cut, Copy and Paste use the async clipboard API, which is what a webview exposes. A refusal is
 * reported through `onNotice` instead of failing silently: a Paste that did nothing is otherwise
 * indistinguishable from one that had nothing to paste.
 */
export function useEditorContextMenu({
	viewRef,
	onToggleBreakpoint,
	onFormat,
	onNotice,
}: {
	viewRef: MutableRefObject<EditorView | null>;
	onToggleBreakpoint?: (line: number) => void;
	onFormat: () => void;
	onNotice?: (message: string | null) => void;
}) {
	const [state, setState] = useState<MenuState | null>(null);

	const open = useCallback(
		(event: PointerEvent) => {
			const view = viewRef.current;
			if (view === null) return;
			event.preventDefault();
			const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
			const target = pos ?? view.state.selection.main.head;
			const selection = view.state.selection.main;
			const clicked = pos !== null;
			// A right click inside an existing selection keeps it; anywhere else moves the caret to the
			// click, the way every editor does, so "Toggle breakpoint" acts on the line under the pointer.
			if (clicked && (target < selection.from || target > selection.to)) {
				view.dispatch({ selection: { anchor: target } });
			}
			const next = clicked ? view.state.selection.main : selection;
			setState({
				x: event.clientX,
				y: event.clientY,
				line: view.state.doc.lineAt(clicked ? target : selection.head).number,
				hasSelection: next.from !== next.to,
			});
		},
		[viewRef],
	);

	const close = useCallback(() => setState(null), []);

	const selectionText = (): string => {
		const view = viewRef.current;
		if (view === null) return "";
		const { from, to } = view.state.selection.main;
		return view.state.sliceDoc(from, to);
	};

	const replaceSelection = (text: string) => {
		const view = viewRef.current;
		if (view === null) return;
		const { from, to } = view.state.selection.main;
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
		});
	};

	const clipboard = async (action: () => Promise<void>) => {
		try {
			await action();
		} catch (error) {
			onNotice?.(
				`Clipboard unavailable: ${error instanceof Error ? error.message : "refused"}`,
			);
		}
	};

	const items = (current: MenuState): MenuItem[] => [
		{
			label: "Cut",
			disabled: !current.hasSelection,
			onSelect: () =>
				void clipboard(async () => {
					const text = selectionText();
					if (text === "") return;
					await navigator.clipboard.writeText(text);
					replaceSelection("");
				}),
		},
		{
			label: "Copy",
			disabled: !current.hasSelection,
			onSelect: () =>
				void clipboard(async () => {
					const text = selectionText();
					if (text !== "") await navigator.clipboard.writeText(text);
				}),
		},
		{
			label: "Paste",
			onSelect: () =>
				void clipboard(async () => {
					const text = await navigator.clipboard.readText();
					if (text !== "") replaceSelection(text);
				}),
		},
		{
			label: "Toggle breakpoint",
			separated: true,
			disabled: onToggleBreakpoint === undefined,
			onSelect: () => onToggleBreakpoint?.(current.line),
		},
		{ label: "Format document", onSelect: onFormat },
	];

	return { state, open, close, items };
}
