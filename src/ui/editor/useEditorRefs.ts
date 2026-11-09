import { useRef } from "react";
import type { EditorView } from "@codemirror/view";
import type { Compartment } from "@codemirror/state";
import type { Diagnostic, FileEdit, Location } from "@/lib/project/api";
import type { EditorProps } from "@/ui/editor/editorTypes";

type Cursor = { line: number; character: number };

/** Every mutable slot the surface shares between render and its long-lived editor view. */
export function useEditorRefs(props: EditorProps) {
	const { path, value, onChange } = props;
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageRef = useRef<Compartment | null>(null);
	const indentRef = useRef<Compartment | null>(null);
	const tabSizeRef = useRef(props.tabSize ?? 4);
	tabSizeRef.current = props.tabSize ?? 4;
	const publishedRef = useRef<{ view: EditorView | null; signature: string }>({
		view: null,
		signature: "",
	});
	const markersRef = useRef<{
		view: EditorView | null;
		lines: number[];
		unverified: Set<number>;
	}>({ view: null, lines: [], unverified: new Set() });
	const pathRef = useRef<string | null>(path);
	pathRef.current = path;
	/**
	 * The text this view last produced. `useDocumentSync` compares against it so a keystroke does not
	 * serialize the whole document to prove the view already holds it.
	 */
	const emittedRef = useRef<string | null>(null);
	const latestRef = useRef({ path, value, onChange });
	latestRef.current = {
		path,
		value,
		onChange: (text: string) => {
			emittedRef.current = text;
			onChange(text);
		},
	};
	const toggleRef = useRef<((line: number) => void) | null>(props.onToggleBreakpoint ?? null);
	toggleRef.current = props.onToggleBreakpoint ?? null;
	const rootRef = useRef<string | null>(props.root ?? null);
	rootRef.current = props.root ?? null;
	const navigateRef = useRef<((path: string, line: number, character: number) => void) | null>(
		props.onNavigate ?? null,
	);
	navigateRef.current = props.onNavigate ?? null;
	const referencesRef = useRef<((locations: Location[]) => void) | null>(
		props.onReferences ?? null,
	);
	referencesRef.current = props.onReferences ?? null;
	const onNoticeRef = useRef<((message: string | null) => void) | null>(props.onNotice ?? null);
	onNoticeRef.current = props.onNotice ?? null;
	const onCursorRef = useRef<((position: Cursor) => void) | null>(props.onCursor ?? null);
	onCursorRef.current = props.onCursor ?? null;
	const onApplyEditsRef = useRef<((edits: FileEdit[]) => void) | null>(
		props.onApplyEdits ?? null,
	);
	onApplyEditsRef.current = props.onApplyEdits ?? null;
	const lastCursorRef = useRef<Cursor | null>(null);
	const revealTokenRef = useRef<number | null>(null);
	/** The document's own findings, read live by the quick-fix binding built with the view. */
	const diagnosticsRef = useRef<Diagnostic[]>(props.diagnostics ?? []);
	diagnosticsRef.current = props.diagnostics ?? [];

	return {
		hostRef,
		viewRef,
		languageRef,
		indentRef,
		tabSizeRef,
		publishedRef,
		markersRef,
		pathRef,
		latestRef,
		toggleRef,
		rootRef,
		navigateRef,
		referencesRef,
		onNoticeRef,
		onCursorRef,
		onApplyEditsRef,
		lastCursorRef,
		revealTokenRef,
		emittedRef,
		diagnosticsRef,
	};
}

export type EditorRefs = ReturnType<typeof useEditorRefs>;
