import { useCallback, useMemo, useRef } from "react";
import type { BreakpointRow, useDebugSession } from "@/lib/debug/session";
import type { FileEdit } from "@/lib/project/api";
import type { GenerateItem } from "@/lib/generate/model";
import { type Location, lspCodeActions } from "@/lib/project/api";
import { sessionForContext } from "@/lib/lsp/context";
import { describeError } from "@/lib/project/errors";
import type { FileBuffer } from "@/lib/project/buffer";

const NO_BREAKPOINTS: BreakpointRow[] = [];

/**
 * Editor-scoped actions the shell owns: breakpoint lines to draw, the Generate menu's insertion,
 * organise-imports, and the references list.
 *
 * Each one needs the caret, so they all read the same three values and nothing else.
 */
export function useEditorActions(options: {
	root: string | null;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	debug: ReturnType<typeof useDebugSession>;
	applyEdits: (edits: FileEdit[]) => void;
	setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
	setFormatting: (value: boolean) => void;
	onNotice: (message: string) => void;
	onReferences: (locations: Location[]) => void;
}) {
	const {
		root,
		activePath,
		cursor,
		debug,
		applyEdits,
		setBuffers,
		setFormatting,
		onNotice,
		onReferences,
	} = options;

	/* Breakpoints live in the debug session, keyed by absolute path, so a tab switch or a gutter
	 * click with no live session both render straight from that map. */
	const activeBreakpoints = useMemo(
		() =>
			activePath === null
				? NO_BREAKPOINTS
				: (debug.breakpointsByPath.get(activePath) ?? NO_BREAKPOINTS),
		[activePath, debug.breakpointsByPath],
	);
	const breakpointLines = useMemo(
		() => activeBreakpoints.map((row) => row.line),
		[activeBreakpoints],
	);
	const unverifiedLines = useMemo(
		() => activeBreakpoints.filter((row) => row.verified === false).map((row) => row.line),
		[activeBreakpoints],
	);
	const toggleBreakpoint = debug.toggleBreakpoint;
	const handleToggleBreakpoint = useCallback(
		(line: number) => {
			if (activePath === null) return;
			toggleBreakpoint(activePath, line);
		},
		[activePath, toggleBreakpoint],
	);

	/** Applies one Generate item to the active buffer; the editor syncs from its value prop. */
	const applyGenerate = useCallback(
		(item: GenerateItem) => {
			const target = activePath;
			if (target === null) return;
			setBuffers((current) =>
				current.map((buffer) => {
					if (buffer.path !== target) return buffer;
					if (item.insert === "end") {
						const base = buffer.text.endsWith("\n") ? buffer.text : `${buffer.text}\n`;
						return { ...buffer, text: `${base}${item.text.replace(/^\n/, "")}` };
					}
					const lines = buffer.text.split("\n");
					const line = Math.min(Math.max(cursor?.line ?? 0, 0), lines.length - 1);
					lines[line] = `${lines[line]}${item.text}`;
					return { ...buffer, text: lines.join("\n") };
				}),
			);
		},
		[activePath, cursor, setBuffers],
	);

	const handleReferences = useCallback(
		(locations: Location[]) => {
			onReferences(locations);
		},
		[onReferences],
	);

	/** The key handler runs before the callback exists, so it reaches it through a ref. */
	const organizeRef = useRef<() => void>(() => {});

	/**
	 * Organise imports, the way CLion's Ctrl Opt O does it: ask the server for code actions at the
	 * top of the file and apply the first one it marks as an import organiser. Servers that do not
	 * implement it answer with nothing, which is reported rather than silently ignored.
	 */
	const organizeImports = useCallback(async () => {
		if (root === null || activePath === null) return;
		const session = sessionForContext(activePath);
		if (session === null) {
			onNotice("No language server is running for this file");
			return;
		}
		setFormatting(true);
		try {
			const actions = await lspCodeActions(session, activePath, 0, 0);
			const organize = actions.find((action) =>
				(action.kind ?? "").startsWith("source.organizeImports"),
			);
			if (organize === undefined) {
				onNotice("This language server has no organise-imports action");
				return;
			}
			applyEdits(organize.edits);
			onNotice(organize.title);
		} catch (error) {
			onNotice(describeError(error));
		} finally {
			setFormatting(false);
		}
	}, [root, activePath, applyEdits, onNotice, setFormatting]);

	organizeRef.current = () => void organizeImports();

	return {
		breakpointLines,
		unverifiedLines,
		handleToggleBreakpoint,
		toggleBreakpoint,
		applyGenerate,
		organizeImports,
		organizeRef,
		handleReferences,
	};
}

export type EditorActions = ReturnType<typeof useEditorActions>;
