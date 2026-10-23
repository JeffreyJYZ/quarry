import { useEffect, useRef } from "react";

/**
 * The dock opens itself the first time an error appears, and stays as the user left it after.
 *
 * A build that starts clean then fails, or a server that publishes the first error of a session,
 * both pass through zero: only that crossing moves the panel.
 */
export function useAutoOpenDock(options: {
	errorCount: number;
	onOpen: (value: boolean | null) => void;
}): void {
	const { errorCount, onOpen } = options;
	const previous = useRef(errorCount);
	useEffect(() => {
		if (errorCount > 0 && previous.current === 0) onOpen(null);
		previous.current = errorCount;
	}, [errorCount, onOpen]);
}
