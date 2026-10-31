/** The commit box's own storage: the unfinished draft and the recent-message ring. */

const HISTORY_CAP = 20;

function draftKey(root: string): string {
	return `quarry.commitDraft:${root}`;
}

function historyKey(root: string): string {
	return `quarry.commitHistory:${root}`;
}

export function readDraft(root: string): string {
	try {
		return window.localStorage.getItem(draftKey(root)) ?? "";
	} catch {
		return "";
	}
}

export function writeDraft(root: string, value: string): void {
	try {
		if (value === "") window.localStorage.removeItem(draftKey(root));
		else window.localStorage.setItem(draftKey(root), value);
	} catch {
		// A blocked storage must not stop a commit; the draft is a convenience.
	}
}

export function readHistory(root: string): string[] {
	try {
		const raw = window.localStorage.getItem(historyKey(root));
		if (raw === null) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((item): item is string => typeof item === "string")
			.slice(0, HISTORY_CAP);
	} catch {
		return [];
	}
}

export function writeHistory(root: string, value: string[]): void {
	try {
		window.localStorage.setItem(historyKey(root), JSON.stringify(value));
	} catch {
		// Same as the draft: a full or blocked store is not a commit failure.
	}
}

/** The message moved onto the ring, newest first, with the old copy of a repeat removed. */
export function rememberMessage(history: string[], message: string): string[] {
	return [message, ...history.filter((item) => item !== message)].slice(0, HISTORY_CAP);
}
