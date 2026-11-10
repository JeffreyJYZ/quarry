import "@/test/render";
import { describe, expect, mock, test } from "bun:test";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { cleanup, fireEvent, render } from "@/test/render";
import { type TodoComment, todoLines } from "@/lib/todo/lines";
import { useTodoGutter } from "@/ui/editor/useTodoGutter";

type HarnessProps = { text: string; onOpen: (marker: TodoComment) => void };

/**
 * The editor's side of the column without the editor: one view, one compartment, the real hook.
 *
 * `text` is propagated the way the surface propagates its buffer, so a rerender is an edit and the
 * marker list is recomputed from it.
 */
function Harness({ text, onOpen }: HarnessProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const gutterRef = useRef<Compartment | null>(null);
	const markersRef = useRef("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: the view is built once per mount
	useEffect(() => {
		const host = hostRef.current;
		if (host === null) return;
		const compartment = new Compartment();
		gutterRef.current = compartment;
		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: text,
				extensions: [compartment.of([]), EditorView.editable.of(false)],
			}),
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
			gutterRef.current = null;
			markersRef.current = "";
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		if (view === null || view.state.doc.toString() === text) return;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
	}, [text]);

	useTodoGutter({ viewRef, gutterRef, markersRef }, todoLines(text), onOpen);
	return <div ref={hostRef} data-testid="host" />;
}

const SAMPLE = "fn main() {}\n// TODO: wire the pump\nlet x = 1;\n// HACK: around it\n";

describe("the TODO gutter column", () => {
	test("draws one marker per marked line", () => {
		const view = render(<Harness text={SAMPLE} onOpen={() => undefined} />);
		const dots = view.container.querySelectorAll(".cm-todo-marker");
		expect(dots).toHaveLength(2);
		expect(dots[0]?.getAttribute("title")).toBe("TODO wire the pump");
		expect(dots[1]?.getAttribute("title")).toBe("HACK around it");
		cleanup();
	});

	test("a file with no markers adds no gutter column", () => {
		const view = render(<Harness text={"fn main() {}\n"} onOpen={() => undefined} />);
		expect(view.container.querySelector(".cm-todo-gutter")).toBeNull();
		cleanup();
	});

	test("an edit that adds a marker mounts the column", () => {
		const view = render(<Harness text={"fn main() {}\n"} onOpen={() => undefined} />);
		expect(view.container.querySelector(".cm-todo-gutter")).toBeNull();
		view.rerender(<Harness text={"// TODO: added\nfn main() {}\n"} onOpen={() => undefined} />);
		expect(view.container.querySelector(".cm-todo-gutter")).not.toBeNull();
		expect(view.container.querySelectorAll(".cm-todo-marker")).toHaveLength(1);
		cleanup();
	});

	test("an edit that removes the last marker drops the column", () => {
		const view = render(
			<Harness text={"// TODO: only one\nfn main() {}\n"} onOpen={() => undefined} />,
		);
		expect(view.container.querySelector(".cm-todo-gutter")).not.toBeNull();
		view.rerender(<Harness text={"fn main() {}\n"} onOpen={() => undefined} />);
		expect(view.container.querySelector(".cm-todo-gutter")).toBeNull();
		cleanup();
	});

	test("a click on a marker opens the TODO window at that entry", () => {
		const open = mock((_marker: TodoComment) => undefined);
		// The harness has no layout, so the gutter resolves a click to the first block: the marker
		// has to be on line 1 for the click to be about a marked line at all.
		const view = render(<Harness text={"// TODO: first line\nfn main() {}\n"} onOpen={open} />);
		const element = view.container.querySelector(".cm-todo-gutter .cm-gutterElement");
		expect(element).not.toBeNull();
		fireEvent.mouseDown(element as Element, { button: 0 });
		expect(open).toHaveBeenCalledTimes(1);
		expect(open.mock.calls[0]?.[0]).toEqual({ line: 1, kind: "TODO", text: "first line" });
		cleanup();
	});
});
