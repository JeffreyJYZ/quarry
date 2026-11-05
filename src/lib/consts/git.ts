/** One letter and one class per working-tree status, so the source-control list cannot drift. */

import type { GitStatusEntry } from "@/lib/project/api";

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
