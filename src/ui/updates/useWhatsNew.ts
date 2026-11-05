import { useEffect } from "react";
import { NOTES_SEEN_KEY, shouldShowWhatsNew } from "@/lib/updates/notes";
import { useCurrentVersion } from "@/ui/updates/useCurrentVersion";

/**
 * Opens the notes on the first launch after an update, once per version.
 *
 * The seen version is stored whatever happens next: a user who closes the panel has answered the
 * question, and re-opening it on the next launch would be the nag this avoids.
 */
export function useWhatsNew(open: () => void): void {
	const version = useCurrentVersion();
	useEffect(() => {
		if (version === null) return;
		let seen: string | null = null;
		try {
			seen = window.localStorage.getItem(NOTES_SEEN_KEY);
		} catch {
			seen = null;
		}
		if (shouldShowWhatsNew(version, seen)) {
			open();
		}
		try {
			window.localStorage.setItem(NOTES_SEEN_KEY, version);
		} catch {
			/* a locked-down webview has no storage; the panel simply does not repeat */
		}
	}, [version, open]);
}
