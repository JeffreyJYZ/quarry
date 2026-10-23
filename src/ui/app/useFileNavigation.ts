import { useCallback } from "react";
import { fileName } from "@/lib/problems/model";

/**
 * Navigation targets: a search hit, a quick-open pick, a problem row, or a language-server jump.
 *
 * Each one opens the file (idempotent when it is already open) and, when it has a position, asks the
 * editor to reveal it by bumping a token the editor watches.
 */
export function useFileNavigation(options: {
	openPath: (path: string, name: string) => Promise<void>;
	activePathRef: React.RefObject<string | null>;
	setRevealTarget: (target: { line: number; character: number } | null) => void;
	setRevealToken: (updater: (current: number) => number) => void;
	setSearchOpen: (open: boolean) => void;
	setQuickOpenOpen: (open: boolean) => void;
}) {
	const { openPath, activePathRef, setRevealTarget, setRevealToken } = options;

	const selectProblem = useCallback(
		(path: string, line?: number, character?: number) => {
			void openPath(path, fileName(path));
			if (line !== undefined && character !== undefined) {
				setRevealTarget({ line, character });
				setRevealToken((current) => current + 1);
			}
		},
		[openPath, setRevealTarget, setRevealToken],
	);

	const openMatch = useCallback(
		(path: string) => {
			options.setSearchOpen(false);
			if (path !== activePathRef.current) void openPath(path, fileName(path));
		},
		[openPath, activePathRef, options],
	);

	const openQuick = useCallback(
		(path: string) => {
			options.setQuickOpenOpen(false);
			if (path !== activePathRef.current) void openPath(path, fileName(path));
		},
		[openPath, activePathRef, options],
	);

	const navigate = useCallback(
		(path: string, line: number, character: number) => {
			void openPath(path, fileName(path));
			setRevealTarget({ line, character });
			setRevealToken((current) => current + 1);
		},
		[openPath, setRevealTarget, setRevealToken],
	);

	return { selectProblem, openMatch, openQuick, navigate };
}
