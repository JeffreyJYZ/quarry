import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { inCommentOrString } from "@/lib/editor/commentString";
import { kindToType } from "@/lib/editor/completion";
import { shouldComplete } from "@/lib/editor/completionTrigger";
import { toLspPosition } from "@/lib/editor/positions";
import { lspCompletion } from "@/lib/project/api";
import { type ServerKind, servedByRunningServer, sessionId } from "@/lib/lsp/served";

/**
 * The editor's completion source, kept out of the extension list so a test can drive it.
 *
 * CodeMirror asks every source for results on each keystroke, so the first question is whether the
 * popup should open at all: `shouldComplete` decides that from the caret and the tree, and only
 * then does the request reach the language server. The fetch, its sequencing and the conversion of
 * the answer are unchanged; a file no running server serves still gets nothing.
 */

export type CompletionSourceDeps = {
	rootRef: { current: string | null };
	latestRef: { current: { path: string | null } };
	runningRef: { current: ReadonlySet<ServerKind> };
	/** The shared request counter, so a slow answer cannot replace a newer one. */
	completionSeq: number;
};

/** The word being typed, which is what the popup filters and applies over. */
const WORD = /\w*/;

/** A member access, whose list is the point and may open before any character is typed. */
const MEMBER_ACCESS = /^(?:\.|->|::)$/;

/** The member operator is at most two characters, so this is all the text a check needs. */
const BEFORE_CARET = 2;

export function createCompletionSource(deps: CompletionSourceDeps) {
	return async (context: CompletionContext): Promise<CompletionResult | null> => {
		const currentRoot = deps.rootRef.current;
		const currentPath = deps.latestRef.current.path;
		if (currentRoot === null || currentPath === null) return null;
		const kind = servedByRunningServer(currentPath, deps.runningRef.current);
		if (kind === null) return null;
		const word = context.matchBefore(WORD);
		const prefix = word === null ? "" : word.text;
		const before = context.state.sliceDoc(Math.max(0, context.pos - BEFORE_CARET), context.pos);
		const allow = shouldComplete({
			explicit: context.explicit,
			prefix,
			inCommentOrString: inCommentOrString(context.state, context.pos),
			afterMemberAccess: MEMBER_ACCESS.test(before),
		});
		if (!allow) return null;
		const mySeq = ++deps.completionSeq;
		const completionView = context.view;
		if (completionView === undefined) return null;
		const { line, character } = toLspPosition(completionView, context.pos);
		let result: Awaited<ReturnType<typeof lspCompletion>>;
		try {
			result = await lspCompletion(
				sessionId(kind, currentRoot),
				currentPath,
				line,
				character,
			);
		} catch {
			return null;
		}
		if (mySeq !== deps.completionSeq) return null;
		if (result === null) return null;
		const from = word === null ? context.pos : word.from;
		const options = result.items.map((item) => ({
			label: item.label,
			detail: item.detail ?? undefined,
			type: kindToType(item.kind),
			apply: item.insertText ?? item.label,
		}));
		return { from, options };
	};
}
