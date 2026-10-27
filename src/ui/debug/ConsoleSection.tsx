import { useEffect, useRef } from "react";
import { useSessionOutput } from "@/lib/debug/useSessionOutput";
import "@/ui/debug/dock/dock-console.css";

/**
 * The program's own output during a debug session, the way CLion's Debug window keeps a Console tab.
 *
 * It reads the adapter's `output` events directly rather than going through the debug controller:
 * the console has one input and no shared state, so threading it through the controller would add
 * fields to every caller and buy nothing. Body only — the dock tab names it.
 */
export default function ConsoleSection({ session }: { session: string | null }) {
	const { text, clear } = useSessionOutput(session);
	const scroller = useRef<HTMLPreElement | null>(null);

	// Follow the tail, but never fight a user who scrolled up to read something.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the text is the trigger — the scroll runs after new output paints, and reading it inside would not change the position.
	useEffect(() => {
		const element = scroller.current;
		if (element === null) return;
		const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
		if (atBottom) element.scrollTop = element.scrollHeight;
	}, [text]);

	return (
		<div className="dock-console">
			<div className="dock-console-bar">
				<span className="dock-debug-label">{session === null ? "no session" : "live"}</span>
				<button
					type="button"
					className="dock-action"
					disabled={text === ""}
					onClick={clear}
				>
					Clear
				</button>
			</div>
			<pre className="debug-console-text" ref={scroller}>
				{text === "" ? (session === null ? "" : "No output yet.") : text}
			</pre>
		</div>
	);
}
