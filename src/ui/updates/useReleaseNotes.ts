import { useEffect, useState } from "react";
import { fetchReleaseNotes } from "@/lib/updates/notes";

export type NotesState = {
	/** The lines to show, once they arrived. */
	notes: string[] | null;
	/** True when the release or its body could not be read; the panel says so rather than spinning. */
	failed: boolean;
};

/**
 * The notes for one version.
 *
 * Fetched once per version: an answer is kept in a module-level cache so opening the prompt, the
 * panel and the palette row in one session costs a single request. Only a real answer is cached —
 * a lookup that failed (offline, rate limited, timed out) is retried the next time the panel opens,
 * because a cached failure would tell the user "No notes for this version" for the rest of the
 * session over one bad moment on the network.
 */
const cache = new Map<string, string[] | null>();

export function useReleaseNotes(version: string | null): NotesState {
	const [state, setState] = useState<NotesState>(() =>
		version === null ? { notes: null, failed: false } : cached(version),
	);

	useEffect(() => {
		if (version === null) {
			setState({ notes: null, failed: false });
			return;
		}
		if (cache.has(version)) {
			setState(cached(version));
			return;
		}
		let live = true;
		const result = fetchReleaseNotes(version);
		void result.then((notes) => {
			if (notes !== null) cache.set(version, notes);
			if (live) setState({ notes, failed: notes === null });
		});
		return () => {
			live = false;
		};
	}, [version]);

	return state;
}

function cached(version: string): NotesState {
	const notes = cache.get(version) ?? null;
	return { notes, failed: notes === null && cache.has(version) };
}
