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

export function dirOf(path: string): string {
	const index = path.lastIndexOf("/");
	if (index <= 0) return "";
	return path.slice(0, index);
}

export function nameOf(path: string): string {
	const index = path.lastIndexOf("/");
	return index >= 0 ? path.slice(index + 1) : path;
}

export function relativeTime(iso: string): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return iso;
	const seconds = Math.round((Date.now() - then) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.round(months / 12)}y ago`;
}
