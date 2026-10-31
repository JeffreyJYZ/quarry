import { useEffect } from "react";

/**
 * Cmd+L asks for a line number.
 *
 * It lives outside the CLion keymap's window listener because that one ignores keys while the editor
 * has focus, and jumping to a line is exactly what a reader wants with the caret in the file. It
 * needs a file to jump in, so it does nothing on an empty editor.
 */
export function useGotoLineKey({
	activePath,
	open,
}: {
	activePath: string | null;
	open: () => void;
}) {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (event.key.toLowerCase() !== "l") return;
			if (activePath === null) return;
			event.preventDefault();
			open();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [activePath, open]);
}
