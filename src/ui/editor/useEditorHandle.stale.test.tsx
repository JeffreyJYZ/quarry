import "@/test/render";
import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import type { EditorHandle } from "@/ui/editor/editorTypes";
import { useDocumentSync } from "@/ui/editor/useDocumentSync";
import { useEditorHandle } from "@/ui/editor/useEditorHandle";
import { act, cleanup, render } from "@/test/render";

/**
 * Format-on-demand: the formatted text is computed from the document at request time
 * (`src/ui/editor/useFormatDocument.ts:48`) and applied when it comes back.
 *
 * `src/ui/editor/useEditorHandle.ts:28-30` hands that text to `onChange` whatever happened in
 * between, so a keystroke that landed during the formatter's run is replaced by the stale result.
 * The caret restore is clamped (`:35-37`), so this never throws — it loses the typing instead.
 */

const DOC_A = "class Widget {\n    int count;\n};\n";
/** What the formatter returns for DOC_A. */
const STALE = "class Widget {\n    int total;\n};\n";
const TYPED = "// typed while formatting\n";

type Props = {
	runFormatText: () => Promise<string | null>;
	onHandle: (handle: EditorHandle | null) => void;
	onView: (view: EditorView) => void;
};

/** The editor's own wiring: handle, live view, and the buffer round-trip a format write takes. */
function Harness({ runFormatText, onHandle, onView }: Props) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const handleRef = useRef<EditorHandle | null>(null);
	const emittedRef = useRef<string | null>(null);
	const latestRef = useRef({ onChange: (value: string) => setValue(value) });
	const [value, setValue] = useState(DOC_A);

	// biome-ignore lint/correctness/useExhaustiveDependencies: one view per mount, as in the surface
	useEffect(() => {
		const host = hostRef.current;
		if (host === null) return;
		const view = new EditorView({ parent: host, state: EditorState.create({ doc: DOC_A }) });
		viewRef.current = view;
		onView(view);
		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	useEditorHandle({ ref: handleRef, viewRef, latestRef, runFormatText });
	useDocumentSync({ viewRef, value, emittedRef });
	// `useImperativeHandle` fills the ref in a layout effect, so it is readable only after mount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reported once the handle exists
	useEffect(() => {
		onHandle(handleRef.current);
	}, []);
	return <div ref={hostRef} />;
}

describe("a format that returns after the document changed", () => {
	test("the stale text never replaces what was typed in the meantime", async () => {
		let settle: ((text: string | null) => void) | null = null;
		const pending = new Promise<string | null>((resolve) => {
			settle = resolve;
		});
		let handle: EditorHandle | null = null;
		let view: EditorView | null = null;

		render(
			<Harness
				runFormatText={() => pending}
				onHandle={(next) => {
					handle = next;
				}}
				onView={(created) => {
					view = created;
				}}
			/>,
		);
		expect(handle).not.toBeNull();
		expect(view).not.toBeNull();
		const live = view as unknown as EditorView;

		act(() => {
			void handle?.format();
		});
		// The user keeps typing while the formatter runs.
		act(() => {
			live.dispatch({ changes: { from: 0, insert: TYPED }, userEvent: "input.type" });
		});
		await act(async () => {
			settle?.(STALE);
			await pending;
		});

		// Today: the document becomes STALE and TYPED is gone. It throws nowhere — the caret
		// restore clamps, so the loss is silent rather than a RangeError.
		expect(live.state.doc.toString()).toContain(TYPED);
		cleanup();
	});
});
