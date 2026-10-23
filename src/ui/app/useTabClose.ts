import { useCallback } from "react";
import { type FileBuffer, isDirty } from "@/lib/project/buffer";

/**
 * Closing tabs.
 *
 * A clean tab closes at once; a dirty one asks on its own row, and saving from that prompt writes
 * first so a failed write keeps the tab open.
 */
export function useTabClose(options: {
	buffersRef: React.RefObject<FileBuffer[]>;
	activePathRef: React.RefObject<string | null>;
	setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
	setActivePath: (path: string | null) => void;
	savePaths: (paths: string[]) => Promise<boolean>;
	setConfirmClose: (path: string | null) => void;
	clearReveal: () => void;
}) {
	const { buffersRef, activePathRef, setBuffers, setActivePath, setConfirmClose } = options;

	const closeNow = useCallback(
		(path: string) => {
			setBuffers((current) => {
				const index = current.findIndex((buffer) => buffer.path === path);
				if (index === -1) return current;
				const remaining = current.filter((buffer) => buffer.path !== path);
				if (activePathRef.current === path) {
					const neighbour = remaining[index] ?? remaining[index - 1] ?? null;
					setActivePath(neighbour ? neighbour.path : null);
				}
				return remaining;
			});
		},
		[activePathRef, setActivePath, setBuffers],
	);

	const close = useCallback(
		(path: string) => {
			const buffer = buffersRef.current.find((entry) => entry.path === path);
			if (buffer === undefined) return;
			if (!isDirty(buffer)) closeNow(path);
			else setConfirmClose(path);
		},
		[buffersRef, closeNow, setConfirmClose],
	);

	const saveClose = useCallback(
		async (path: string) => {
			const ok = await options.savePaths([path]);
			setConfirmClose(null);
			if (ok) closeNow(path);
		},
		[options, closeNow, setConfirmClose],
	);

	const discardClose = useCallback(
		(path: string) => {
			setConfirmClose(null);
			closeNow(path);
		},
		[closeNow, setConfirmClose],
	);

	const cancelClose = useCallback(() => setConfirmClose(null), [setConfirmClose]);

	const activate = useCallback(
		(path: string) => {
			setConfirmClose(null);
			options.clearReveal();
			setActivePath(path);
		},
		[options, setActivePath, setConfirmClose],
	);

	return { close, saveClose, discardClose, cancelClose, activate, closeNow };
}
