/** Severity spelling for the problems list: one class and one label per LSP severity number. */

import type { Diagnostic } from "@/lib/project/api";

export const SEVERITY_CLASS: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

export const SEVERITY_LABEL: Record<Diagnostic["severity"], string> = {
	1: "error",
	2: "warning",
	3: "information",
	4: "hint",
};
