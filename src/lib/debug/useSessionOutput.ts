import { useCallback, useEffect, useRef, useState } from "react";
import { onDapOutput } from "@/lib/project/api/dap";

/** How much program output the console keeps before it drops the oldest text. */
const MAX_CHARS = 200_000;

/**
 * The debuggee's own output, as the adapter reports it.
 *
 * DAP sends `output` chunks that do not respect line boundaries, so the text is accumulated
 * verbatim and rendered with `pre`-style wrapping: splitting on newlines would invent breaks the
 * program never printed.
 */
export function useSessionOutput(sessionId: string | null): {
	text: string;
	clear: () => void;
} {
	const [text, setText] = useState("");
	const sessionRef = useRef<string | null>(sessionId);
	sessionRef.current = sessionId;

	useEffect(() => {
		let live = true;
		let unlisten: (() => void) | null = null;
		// One subscription for the component's lifetime: the session it filters on lives in a ref,
		// so a second session never needs a second listener.
		onDapOutput((event) => {
			if (sessionRef.current === null || event.session !== sessionRef.current) return;
			setText((current) => {
				const next = current + event.output;
				return next.length > MAX_CHARS ? next.slice(next.length - MAX_CHARS) : next;
			});
		}).then(
			(off) => {
				if (live) unlisten = off;
				else off();
			},
			() => {
				/* A listener that never registered leaves the console empty, never broken. */
			},
		);
		return () => {
			live = false;
			unlisten?.();
		};
	}, []);

	// A new session starts with an empty console, the way a new run starts with an empty log.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the session id is the trigger — the reset must run when the session changes, not read it.
	useEffect(() => {
		setText("");
	}, [sessionId]);

	const clear = useCallback(() => setText(""), []);

	return { text, clear };
}
