import type { Diagnostic, FileEdit, Location } from "@/lib/project/api";

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
	/** Apply a batch of file edits produced by rename or code actions. */
	onApplyEdits?: (edits: FileEdit[]) => void;
	/** Indent width in spaces; 4 when absent. */
	tabSize?: number;
	/** Editor font size in px; 13 when absent. */
	fontSize?: number;
	/** Editor font family; empty keeps the built-in monospace stack. */
	fontFamily?: string;
};

export type EditorHandle = {
	format: () => Promise<void>;
	/** The formatted text without touching the document; null when no formatter is available. */
	formatText: () => Promise<string | null>;
};
