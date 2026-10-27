import type { DebugController, StopView } from "@/lib/debug/session";
import { useEvaluate } from "@/lib/debug/useEvaluate";
import "@/ui/debug/dock/dock-eval.css";

/**
 * The Evaluate expression field above the variables tree, the CLion variables pane's one free-text
 * row. Enter evaluates in the selected frame, Escape forgets the expression; the answer sits beside
 * the field, and a refusal shows the adapter's own message rather than an empty value.
 */
export default function EvaluateField({
	debug,
	view,
}: {
	debug: DebugController;
	view: StopView | null;
}) {
	const { expression, setExpression, busy, error, result, evaluate, clear } = useEvaluate({
		session: debug.sessionId,
		stop: view,
	});
	const frameId = view === null ? null : (view.frameId ?? view.frames[0]?.id ?? null);
	const live = debug.status === "stopped" && debug.sessionId !== null && frameId !== null;

	return (
		<div className="dock-eval">
			<input
				className="dock-eval-input"
				type="text"
				value={expression}
				placeholder="Evaluate expression"
				aria-label="Evaluate expression"
				disabled={!live}
				spellCheck={false}
				autoComplete="off"
				onChange={(event) => setExpression(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						evaluate(frameId);
					}
					if (event.key === "Escape") {
						event.preventDefault();
						clear();
					}
				}}
			/>
			{live === false ? null : (
				<div className="dock-eval-answer">
					{busy ? <span className="dock-eval-pending">evaluating…</span> : null}
					{error === null ? null : <span className="dock-eval-error">{error}</span>}
					{result === null ? null : (
						<>
							<span className="dock-eval-value">{result.result}</span>
							{result.typeName === null ? null : (
								<span className="dock-eval-type">{result.typeName}</span>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
