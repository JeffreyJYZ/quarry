import { useState } from "react";
import { lspExecuteCommand } from "@/lib/project/api/lsp";
import type { CodeAction, FileEdit } from "@/lib/project/api";

/** The code actions at the caret, and the one the user picks. */
export function useCodeActionMenu(options: {
	onApplyEdits: { current: ((edits: FileEdit[]) => void) | null };
	rootRef?: { current: string | null };
	onNotice?: { current: ((message: string) => void) | null };
}) {
	const [codeActions, setCodeActions] = useState<CodeAction[]>([]);
	const [codeMenuOpen, setCodeMenuOpen] = useState(false);

	const apply = (action: CodeAction) => {
		setCodeMenuOpen(false);
		if (action.edits.length > 0) options.onApplyEdits.current?.(action.edits);
		if (action.command) {
			const session = options.rootRef?.current;
			if (session) {
				void lspExecuteCommand(session, action.command)
					.then(() => {
						options.onNotice?.current?.(action.title);
					})
					.catch(() => {
						options.onNotice?.current?.(`failed: ${action.title}`);
					});
			}
		} else if (action.edits.length === 0) {
			options.onNotice?.current?.(action.title);
		}
	};

	return { codeActions, setCodeActions, codeMenuOpen, setCodeMenuOpen, apply };
}
