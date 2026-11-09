/** The title each go-to mode shows above its list. */

import type { GotoMode } from "@/ui/goto/gotoModel";

export const TITLES: Record<GotoMode, string> = {
	class: "Go to class",
	symbol: "Go to symbol in file",
	recent: "Recent files",
};

/** Rows the goto dialog filters and shows; beyond this nobody scrolls. */
export const GOTO_RESULT_LIMIT = 200;
