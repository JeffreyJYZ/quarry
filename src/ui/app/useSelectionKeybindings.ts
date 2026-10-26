import { useEffect } from "react";

/** Accelerators that need the current selection: reveal, quick open, run to caret, hierarchies. */
export function useSelectionKeybindings(context: {
	root: string | null;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	activePathRef: React.RefObject<string | null>;
	runToCursor: (path: string, line: number) => void;
	setFileRevealToken: (updater: (current: number) => number) => void;
	setRailCollapsed: (updater: (current: boolean) => boolean) => void;
	setQuickOpenOpen: (open: boolean) => void;
	setCallsCursor: (cursor: { line: number; character: number } | null) => void;
	setCallsOpen: (open: boolean) => void;
	setTypeHierarchyCursor: (cursor: { line: number; character: number } | null) => void;
	setTypeHierarchyOpen: (open: boolean) => void;
}): void {
	const { root, activePath, cursor, activePathRef, runToCursor } = context;

	/** Cmd+Shift+E reveals the active file in the explorer. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || !event.shiftKey) return;
			if (event.key.toLowerCase() !== "e") return;
			if (root === null || activePath === null) return;
			event.preventDefault();
			context.setRailCollapsed(() => false);
			context.setFileRevealToken((current) => current + 1);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root, activePath, context.setFileRevealToken, context.setRailCollapsed]);

	/** Cmd+P opens quick open by file name. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (event.key.toLowerCase() !== "p" || root === null) return;
			event.preventDefault();
			context.setQuickOpenOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root, context.setQuickOpenOpen]);

	/** Cmd+F10 runs to the caret line. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (event.key !== "F10") return;
			const path = activePathRef.current;
			if (path === null || cursor === null) return;
			event.preventDefault();
			runToCursor(path, cursor.line + 1);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [cursor, runToCursor, activePathRef]);

	/** Shift+Alt+H opens the call hierarchy panel, Shift+Alt+T the type hierarchy. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.shiftKey || !event.altKey || event.metaKey || event.ctrlKey) return;
			const key = event.key.toLowerCase();
			if (key !== "h" && key !== "t") return;
			event.preventDefault();
			if (key === "h") {
				context.setCallsCursor(cursor);
				context.setCallsOpen(true);
			} else {
				context.setTypeHierarchyCursor(cursor);
				context.setTypeHierarchyOpen(true);
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [
		cursor,
		context.setCallsCursor,
		context.setCallsOpen,
		context.setTypeHierarchyCursor,
		context.setTypeHierarchyOpen,
	]);
}
