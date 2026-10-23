import type { EditorView } from "@codemirror/view";

export function toLspPosition(view: EditorView, pos: number): { line: number; character: number } {
	const lineObj = view.state.doc.lineAt(pos);
	return { line: lineObj.number - 1, character: pos - lineObj.from };
}
