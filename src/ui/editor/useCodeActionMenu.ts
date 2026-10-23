import { useState } from "react";
import type { CodeAction, FileEdit } from "@/lib/project/api";

/** The code actions at the caret, and the one the user picks. */
export function useCodeActionMenu(options: {
	onApplyEdits: { current: ((edits: FileEdit[]) => void) | null };
}) {
	const [codeActions, setCodeActions] = useState<CodeAction[]>([]);
	const [codeMenuOpen, setCodeMenuOpen] = useState(false);

	const apply = (action: CodeAction) => {
		setCodeMenuOpen(false);
		if (action.edits.length > 0) options.onApplyEdits.current?.(action.edits);
	};

	return { codeActions, setCodeActions, codeMenuOpen, setCodeMenuOpen, apply };
}
