/** One letter and one class per working-tree status, so the source-control list cannot drift. */

import type { GitStatusEntry } from "@/lib/project/api";

/** Commit hashes are shown and copied short; the history, blame and copy button agree here. */
export const SHORT_HASH_LEN = 7;

/** The history list's first page and its ceiling, so "Load more" cannot promise rows it hides. */
export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_LIMIT = 500;

export const STATUS_LETTER: Record<GitStatusEntry["status"], string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "?",
	conflicted: "!",
};

export const STATUS_CLASS: Record<GitStatusEntry["status"], string> = {
	modified: "git-status-modified",
	added: "git-status-added",
	deleted: "git-status-deleted",
	renamed: "git-status-renamed",
	untracked: "git-status-untracked",
	conflicted: "git-status-conflicted",
};
