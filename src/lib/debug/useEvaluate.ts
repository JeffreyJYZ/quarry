import { useCallback, useRef, useState } from "react";
import { type DapEvaluation, dapEvaluate } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { StopView } from "./sessionTypes";

/** One answer, tagged with the stop view it was produced for. */
type Answer = {
	stop: StopView | null;
	result: DapEvaluation | null;
	error: string | null;
	busy: boolean;
};

/**
 * The dock's Evaluate expression field: one expression, one answer.
 *
 * An answer carries the stop view it belongs to and is only rendered while that view is the current
 * one, so a new stop (or another frame) drops the previous value without an effect. A generation
 * counter does the second half: a reply that lands after a newer Enter is discarded rather than
 * overwriting the newer answer.
 */
export function useEvaluate(options: { session: string | null; stop: StopView | null }) {
	const { session, stop } = options;
	const [expression, setExpression] = useState("");
	const [answer, setAnswer] = useState<Answer | null>(null);
	const generationRef = useRef(0);

	const shown = answer !== null && answer.stop === stop ? answer : null;

	/** Escape: forget the expression and whatever it answered. */
	const clear = useCallback(() => {
		generationRef.current += 1;
		setExpression("");
		setAnswer(null);
	}, []);

	const evaluate = useCallback(
		(frameId: number | null) => {
			const text = expression.trim();
			if (session === null || text === "") return;
			const generation = generationRef.current + 1;
			generationRef.current = generation;
			setAnswer({ stop, result: null, error: null, busy: true });
			dapEvaluate(session, text, frameId).then(
				(result) => {
					if (generationRef.current !== generation) return;
					setAnswer({ stop, result, error: null, busy: false });
				},
				(reason) => {
					if (generationRef.current !== generation) return;
					setAnswer({
						stop,
						result: null,
						error: describeError(reason),
						busy: false,
					});
				},
			);
		},
		[expression, session, stop],
	);

	return {
		expression,
		setExpression,
		busy: shown?.busy ?? false,
		error: shown?.error ?? null,
		result: shown?.result ?? null,
		evaluate,
		clear,
	};
}
