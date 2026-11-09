import { type KeyboardEvent, type RefObject, useCallback, useEffect, useRef } from "react";
import { dialogFocusables, dialogTabTarget } from "./dialogFocus";

export type DialogFocusOptions = {
	/**
	 * Selector for the control that takes focus when the dialog opens, relative to the panel.
	 * Without it the panel itself takes focus, so the first Tab starts inside the dialog.
	 */
	initialFocus?: string;
	/**
	 * Closes the dialog on Escape. Omitted when something inside it owns Escape, such as an editor
	 * holding a draft, so the key is left alone for that handler.
	 */
	onClose?: () => void;
};

export type DialogFocus = {
	/** Attach to the `role="dialog"` panel, which must also carry `tabIndex={-1}`. */
	panelRef: RefObject<HTMLDivElement | null>;
	/**
	 * Closes the Tab loop, and the dialog when `onClose` is given. Tab only handles Tab, so a
	 * dialog keeps its own arrow and Enter handling; a key a field already consumed
	 * (`defaultPrevented`) is left alone.
	 */
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * Keeps keyboard focus inside an open modal, and gives it back to the opener on close.
 *
 * `open` is the dialog's own visibility: a dialog that unmounts on close passes `true`, because
 * mounting is opening and unmounting runs the cleanup.
 */
export function useDialogFocus(open: boolean, options: DialogFocusOptions = {}): DialogFocus {
	const { initialFocus, onClose } = options;
	const panelRef = useRef<HTMLDivElement | null>(null);
	const openerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;
		openerRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const panel = panelRef.current;
		if (panel === null) return;
		// A field that already took focus keeps it; otherwise the requested control does, and the
		// panel is the fallback, so the first Tab starts from inside the dialog.
		if (!panel.contains(document.activeElement)) {
			const target =
				initialFocus === undefined ? null : panel.querySelector<HTMLElement>(initialFocus);
			(target ?? panel).focus();
		}
		return () => {
			const opener = openerRef.current;
			openerRef.current = null;
			if (opener?.isConnected) opener.focus();
		};
	}, [open, initialFocus]);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			if (event.key === "Escape") {
				if (onClose === undefined) return;
				event.preventDefault();
				onClose();
				return;
			}
			if (event.key !== "Tab" || event.defaultPrevented) return;
			const panel = panelRef.current;
			if (panel === null) return;
			const focusable = dialogFocusables(panel);
			const current = focusable.indexOf(document.activeElement as HTMLElement);
			const target = dialogTabTarget(focusable.length, current, event.shiftKey);
			if (target === null) return;
			event.preventDefault();
			focusable[target]?.focus();
		},
		[onClose],
	);

	return { panelRef, onKeyDown };
}
