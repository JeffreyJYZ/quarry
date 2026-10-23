import { useCallback } from "react";
import {
	dapExceptionFilters,
	dapSetExceptionBreakpoints,
	type ExceptionFilter,
} from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/**
 * Exception filters: what the adapter offers, which ones are checked, and the round trip that sets
 * them. A failed write restores the previous set so the checkboxes never lie about the session.
 */
export function useExceptionFilters(options: {
	sessionRef: { current: string | null };
	exceptionCheckedRef: { current: Set<string> };
	setExceptionFilters: (filters: ExceptionFilter[]) => void;
	setExceptionChecked: (next: Set<string>) => void;
	setError: (message: string | null) => void;
}) {
	const { sessionRef, exceptionCheckedRef, setExceptionFilters, setExceptionChecked, setError } =
		options;

	const loadExceptionFilters = useCallback(
		async (session: string, preserveChecked: boolean) => {
			try {
				const filters = await dapExceptionFilters(session);
				if (sessionRef.current !== session) return;
				setExceptionFilters(filters);
				const available = new Set(filters.map((filter) => filter.filter));
				let nextChecked: Set<string>;
				if (preserveChecked) {
					nextChecked = new Set(
						[...exceptionCheckedRef.current].filter((filter) => available.has(filter)),
					);
				} else {
					nextChecked = new Set(
						filters.filter((filter) => filter.default).map((filter) => filter.filter),
					);
				}
				exceptionCheckedRef.current = nextChecked;
				setExceptionChecked(nextChecked);
				try {
					await dapSetExceptionBreakpoints(session, [...nextChecked]);
				} catch (reason) {
					if (sessionRef.current === session) {
						setError(`Exceptions: ${describeError(reason)}`);
					}
				}
			} catch (reason) {
				if (sessionRef.current === session) {
					setError(`Exceptions: ${describeError(reason)}`);
					setExceptionFilters([]);
				}
			}
		},
		[sessionRef, exceptionCheckedRef, setExceptionChecked, setExceptionFilters, setError],
	);

	const toggleExceptionFilter = useCallback(
		async (filter: string, checked: boolean) => {
			const session = sessionRef.current;
			if (session === null) return;
			const previous = new Set(exceptionCheckedRef.current);
			const next = new Set(previous);
			if (checked) next.add(filter);
			else next.delete(filter);
			exceptionCheckedRef.current = next;
			setExceptionChecked(next);
			try {
				await dapSetExceptionBreakpoints(session, [...next]);
			} catch (reason) {
				if (sessionRef.current === session) {
					exceptionCheckedRef.current = previous;
					setExceptionChecked(previous);
					setError(`Exceptions: ${describeError(reason)}`);
				}
			}
		},
		[sessionRef, exceptionCheckedRef, setExceptionChecked, setError],
	);

	return { loadExceptionFilters, toggleExceptionFilter };
}
