import { useRef } from "react";
import type { SessionSnapshot } from "@/ui/app/useSessionPersistence";

/**
 * A ref that always holds the current session snapshot.
 *
 * The persistence hook reads it on a timer and on window hide, so it needs the latest values without
 * re-registering a listener on every keystroke.
 */
export function useSnapshotRef(build: () => SessionSnapshot) {
	const ref = useRef<SessionSnapshot>(build());
	ref.current = build();
	return ref;
}
