import { useEffect, useState } from "react";
import { type NoteBlock, fetchReleaseNotes } from "@/lib/updates/notes";

export type NotesState = {
	/** The blocks to show, once they arrived. `[]` means a release with no notes. */
	notes: NoteBlock[] | null;
	/** True when the release or its body could not be read; the panel says so rather than spinning. */
	failed: boolean;
};

/**
 * The notes for one version.
 *
 * Fetched once per version: an answer is kept in a module-level cache so opening the prompt, the
 * panel and the palette row in one session costs a single request. Only a real answer is cached —
 * a lookup that failed (offline, rate limited, timed out) is retried the next time the panel opens,
 * because a cached failure would tell the user "Could not load release notes" for the rest of the
 * session over one bad moment on the network. An empty body is retried too.
 */
const cache = new Map<string, NoteBlock[]>();

export function useReleaseNotes(version: string | null): NotesState {
	const [state, setState] = useState<NotesState>(() =>
		version === null ? { notes: null, failed: false } : cached(version),
	);

	useEffect(() => {
		if (version === null) {
			setState({ notes: null, failed: false });
			return;
		}
		const saved = cache.get(version);
		if (saved !== undefined) {
			setState({ notes: saved, failed: false });
			return;
		}
		let live = true;
		const result = fetchReleaseNotes(version);
		void result.then((notes) => {
			if (notes !== null && notes.length > 0) cache.set(version, notes);
			if (live) setState({ notes, failed: notes === null });
		});
		return () => {
			live = false;
		};
	}, [version]);

	return state;
}

function cached(version: string): NotesState {
	return { notes: cache.get(version) ?? null, failed: false };
}
