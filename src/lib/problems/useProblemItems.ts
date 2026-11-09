import { useMemo } from "react";
import type { Diagnostic } from "@/lib/project/api";
import type { ProblemFile } from "./model";

export type ProblemItem = { path: string; diagnostic: Diagnostic };

/**
 * One row per diagnostic across every file, in file order.
 *
 * The grouped panel reads only the count and the selection from this list, so rebuilding it on
 * every arrow key was work whose result was thrown away on the next render.
 */
export function useProblemItems(files: ProblemFile[]): ProblemItem[] {
	return useMemo(
		() =>
			files.flatMap((file) =>
				file.diagnostics.map((diagnostic) => ({ path: file.path, diagnostic })),
			),
		[files],
	);
}
