import type { Diagnostic, FileEdit, Location } from "@/lib/project/api";
import type { TestMarker } from "@/lib/tests/gutter";
import type { TodoComment } from "@/lib/todo/lines";

/** The comment markers of the open buffer, and what a click on one does. */
export type TodoGutterProps = {
	/** 1-based lines carrying a marker; empty draws no gutter column at all. */
	markers: readonly TodoComment[];
	/** A click on a marker, which is where the TODO window opens. */
	onOpen: (marker: TodoComment) => void;
};

/**
 * The debugger as the editor sees it: where it stopped, and how to run to a line.
 *
 * `path`/`line` are the top frame's, so an editor paints the stop only when its own file matches.
 */
export type EditorDebug = {
	/** True while a session is stopped, which is the only time Run to cursor acts. */
	stopped: boolean;
	path: string | null;
	line: number;
	runToCursor: (path: string, line: number) => void;
};

export type EditorProps = {
	/** Absolute path of the open file, or null for an empty buffer. */
	path: string | null;
	value: string;
	onChange: (value: string) => void;
	/** Diagnostics for this document only. The editor renders them; it never fetches them. */
	diagnostics?: Diagnostic[];
	/** 1-based lines carrying a breakpoint, drawn as filled dots in the gutter. */
	breakpointLines?: number[];
	/** Subset of `breakpointLines` the adapter has not confirmed; drawn hollow and dimmed. */
	unverifiedLines?: number[];
	/** Clicking the breakpoint gutter reports a 1-based line; the caller owns the set. */
	onToggleBreakpoint?: (line: number) => void;
	/** Run buttons for the tests `list_tests` named in this file; empty draws no column. */
	testMarkers?: TestMarker[];
	/** A click on a test marker, and whether that click asked for its group. */
	onTestMarker?: (marker: TestMarker, group: boolean) => void;
	/** 1-based lines carrying a bookmark, drawn as ribbons in their own gutter column. */
	bookmarkLines?: number[];
	/** Clicking the bookmark gutter reports a 1-based line; the caller owns the set. */
	onToggleBookmark?: (line: number) => void;
	/** Comment markers for this file, drawn in their own gutter column; absent draws no column. */
	todo?: TodoGutterProps;
	/** Open project root; null disables all LSP requests. */
	root?: string | null;
	/** Navigate to a definition location. */
	onNavigate?: (path: string, line: number, character: number) => void;
	/** Receive reference locations. */
	onReferences?: (locations: Location[]) => void;
	/** Move the caret to a zero-based position and scroll it into view. */
	reveal?: { line: number; character: number; token: number } | null;
	/** Report a one-line status to the host (no formatter / formatter failure). */
	onNotice?: (message: string | null) => void;
	/** Report caret position changes. */
	onCursor?: (position: { line: number; character: number }) => void;
	/** Per-line blame annotations; null/undefined clears them. */
	blame?: { line: number; label: string }[] | null;
	/** The stopped location and the debug session's actions; absent outside the debugger. */
	debug?: EditorDebug;
	/** Apply a batch of file edits produced by rename or code actions. */
	onApplyEdits?: (edits: FileEdit[]) => void;
	/** Indent width in spaces; 4 when absent. */
	tabSize?: number;
	/** Editor font size in px; 13 when absent. */
	fontSize?: number;
	/** Editor font family; empty keeps the built-in monospace stack. */
	fontFamily?: string;
	/**
	 * The document this mount belongs to (`path#loadId`). Its editor state is saved on unmount and
	 * restored by a later mount of the same id, so a tab switch keeps undo, caret and scroll; a
	 * reload changes the id and starts empty.
	 */
	documentId?: string | null;
};

export type EditorHandle = {
	format: () => Promise<void>;
	/** The formatted text without touching the document; null when no formatter is available. */
	formatText: () => Promise<string | null>;
};
