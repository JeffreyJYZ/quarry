import { type KeyboardEvent, type RefObject, useCallback, useEffect, useRef } from "react";
import { dialogFocusables, dialogTabTarget } from "./dialogFocus";

export type DialogFocus = {
	/** Attach to the `role="dialog"` panel, which must also carry `tabIndex={-1}`. */
	panelRef: RefObject<HTMLDivElement | null>;
	/**
	 * Closes the Tab loop. It only handles Tab, so a dialog keeps its own Escape, arrow and Enter
	 * handling; a key a field already consumed (`defaultPrevented`) is left alone.
	 */
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * Keeps keyboard focus inside an open modal, and gives it back to the opener on close.
 *
 * `open` is the dialog's own visibility: a dialog that unmounts on close passes `true`, because
 * mounting is opening and unmounting runs the cleanup.
 */
export function useDialogFocus(open: boolean): DialogFocus {
	const panelRef = useRef<HTMLDivElement | null>(null);
	const openerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;
		openerRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const panel = panelRef.current;
		// A field that already took focus keeps it; otherwise the panel does, so the first Tab
		// starts from inside the dialog rather than from the page behind it.
		if (panel !== null && !panel.contains(document.activeElement)) panel.focus();
		return () => {
			const opener = openerRef.current;
			openerRef.current = null;
			if (opener?.isConnected) opener.focus();
		};
	}, [open]);

	const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
		if (event.key !== "Tab" || event.defaultPrevented) return;
		const panel = panelRef.current;
		if (panel === null) return;
		const focusable = dialogFocusables(panel);
		const current = focusable.indexOf(document.activeElement as HTMLElement);
		const target = dialogTabTarget(focusable.length, current, event.shiftKey);
		if (target === null) return;
		event.preventDefault();
		focusable[target]?.focus();
	}, []);

	return { panelRef, onKeyDown };
}
