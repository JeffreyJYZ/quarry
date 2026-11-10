import { useMemo } from "react";
import type { TestItem, TestReport } from "@/lib/project/api";
import { type TestMarker, testMarkers } from "@/lib/tests/gutter";

export type TestMarkerInput = {
	path: string | null;
	text: string;
	items: readonly TestItem[];
	results: ReadonlyMap<string, TestReport>;
	running: ReadonlySet<string>;
};

/** The active file's gutter markers, recomputed only when its text or the test state moves. */
export function useTestMarkers(input: TestMarkerInput): TestMarker[] {
	const { path, text, items, results, running } = input;
	return useMemo(
		() => testMarkers({ path, text, items, results, running }),
		[path, text, items, results, running],
	);
}
