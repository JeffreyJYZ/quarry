/**
 * When the completion popup may open at all.
 *
 * The popup is asked for completions on every keystroke, and a list that opens while prose is being
 * typed is noise. Three facts decide it: an explicit request, what sits just before the caret, and
 * whether the syntax tree says the caret is still in code. This module is the first two; the tree
 * lookup lives beside it in `commentString.ts` so this stays a pure function.
 */

export type CompletionTrigger = {
	/** Mod-Space, or `startCompletion` on the way back into the popup. */
	explicit: boolean;
	/** The word characters immediately before the caret; empty at a bare member access. */
	prefix: string;
	/** The caret sits in a comment or a string literal, read from the syntax tree. */
	inCommentOrString: boolean;
	/** The caret is just after `.`, `->` or `::`. */
	afterMemberAccess: boolean;
};

/** One character is the start of a name, not yet a name: the list is premature and jumps around. */
const MINIMUM_PREFIX = 2;

const DIGITS_ONLY = /^\d+$/;

export function shouldComplete(trigger: CompletionTrigger): boolean {
	if (trigger.explicit) return true;
	if (trigger.inCommentOrString) return false;
	if (trigger.afterMemberAccess) return true;
	if (trigger.prefix.length < MINIMUM_PREFIX) return false;
	return !DIGITS_ONLY.test(trigger.prefix);
}
