import { useState } from "react";
import type { Location } from "@/lib/project/api";
import type { GotoMode } from "@/ui/goto/gotoModel";

export type Cursor = { line: number; character: number } | null;

/**
 * Everything that opens *over* the editor: palettes, the search sheet, goto, generate, references
 * and the two hierarchy panels.
 *
 * The editor reports the caret upwards so these can open at the right place; the reveal target is
 * the reverse trip, a position the editor scrolls to when its token changes.
 */
export function useOverlays() {
	const [cursor, setCursor] = useState<Cursor>(null);
	const [revealTarget, setRevealTarget] = useState<{ line: number; character: number } | null>(
		null,
	);
	const [revealToken, setRevealToken] = useState(0);
	const [references, setReferences] = useState<Location[]>([]);
	const [refsOpen, setRefsOpen] = useState(false);
	const [callsOpen, setCallsOpen] = useState(false);
	const [callsCursor, setCallsCursor] = useState<Cursor>(null);
	const [typeHierarchyOpen, setTypeHierarchyOpen] = useState(false);
	const [typeHierarchyCursor, setTypeHierarchyCursor] = useState<Cursor>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [quickOpenOpen, setQuickOpenOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [recentCommands, setRecentCommands] = useState<string[]>([]);
	const [gotoMode, setGotoMode] = useState<GotoMode | null>(null);
	const [generateOpen, setGenerateOpen] = useState(false);

	return {
		cursor,
		setCursor,
		revealTarget,
		setRevealTarget,
		revealToken,
		setRevealToken,
		references,
		setReferences,
		refsOpen,
		setRefsOpen,
		callsOpen,
		setCallsOpen,
		callsCursor,
		setCallsCursor,
		typeHierarchyOpen,
		setTypeHierarchyOpen,
		typeHierarchyCursor,
		setTypeHierarchyCursor,
		searchOpen,
		setSearchOpen,
		quickOpenOpen,
		setQuickOpenOpen,
		shortcutsOpen,
		setShortcutsOpen,
		commandPaletteOpen,
		setCommandPaletteOpen,
		recentCommands,
		setRecentCommands,
		gotoMode,
		setGotoMode,
		generateOpen,
		setGenerateOpen,
	};
}

export type Overlays = ReturnType<typeof useOverlays>;
