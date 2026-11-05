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
 * Fetched once per version: the result is kept in a module-level cache so opening the prompt, the
 * panel and the palette row in one session costs a single request.
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
			cache.set(version, notes);
			if (live) setState(cached(version));
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
