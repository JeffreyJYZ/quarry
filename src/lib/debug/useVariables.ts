import { useCallback } from "react";
import { type DapVariable, dapScopes, dapSetVariable, dapVariables } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { StopView, VariableRow } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

export type VariableDeps = {
	sessionRef: { current: string | null };
	generationRef: { current: number };
	childrenRef: { current: Map<number, DapVariable[]> };
	expandedRef: { current: Set<string> };
	setChildren: Setter<Map<number, DapVariable[]>>;
	setExpanded: Setter<Set<string>>;
	setStopView: Setter<StopView | null>;
	setSelectedVariable: Setter<VariableRow | null>;
	setError: (message: string | null) => void;
};

/**
 * The variables tree: the scopes of the selected frame, lazy child lists, and writes back.
 *
 * Every async landing checks the generation it started in, because a second stop (or a project
 * switch) must not leave the previous frame's rows on screen.
 */
export function useVariables(deps: VariableDeps) {
	const {
		sessionRef,
		generationRef,
		childrenRef,
		expandedRef,
		setChildren,
		setExpanded,
		setStopView,
		setSelectedVariable,
		setError,
	} = deps;

	/** Load one frame's scopes and their top-level variables; nested rows load on demand. */
	const loadFrame = useCallback(
		async (session: string, frameId: number) => {
			const generation = ++generationRef.current;
			setChildren(new Map());
			setExpanded(new Set());
			setSelectedVariable(null);
			let failure: string | null = null;
			try {
				const scopes = await dapScopes(session, frameId);
				if (generation !== generationRef.current) return;
				setStopView((current) => (current === null ? current : { ...current, scopes }));
				const lists = await Promise.all(
					scopes.map(async (scope) => {
						try {
							const value = await dapVariables(session, scope.variablesReference);
							return { scope, value };
						} catch (reason) {
							failure = `${scope.name}: ${describeError(reason)}`;
							return { scope, value: null };
						}
					}),
				);
				if (generation !== generationRef.current) return;
				const next = new Map<number, DapVariable[]>();
				for (const entry of lists) {
					if (entry.value !== null) next.set(entry.scope.variablesReference, entry.value);
				}
				childrenRef.current = next;
				setChildren(next);
			} catch (reason) {
				if (generation === generationRef.current)
					setError(`Scopes: ${describeError(reason)}`);
			}
			if (failure !== null) setError(`Variables: ${failure}`);
		},
		[
			childrenRef,
			generationRef,
			setChildren,
			setError,
			setExpanded,
			setSelectedVariable,
			setStopView,
		],
	);

	const selectFrame = useCallback(
		(frameId: number) => {
			const session = sessionRef.current;
			if (session === null) return;
			setStopView((current) => (current === null ? current : { ...current, frameId }));
			void loadFrame(session, frameId);
		},
		[loadFrame, sessionRef, setStopView],
	);

	const toggleVariable = useCallback(
		(row: VariableRow) => {
			const reference = row.variablesReference;
			if (expandedRef.current.has(row.key)) {
				/* Descendant keys go too, or a re-expanded row would render stale grandchildren. */
				const nextExpanded = new Set<string>();
				for (const key of expandedRef.current) {
					if (key !== row.key && !key.startsWith(`${row.key}/`)) nextExpanded.add(key);
				}
				expandedRef.current = nextExpanded;
				setExpanded(nextExpanded);
				const nextChildren = new Map(childrenRef.current);
				nextChildren.delete(reference);
				childrenRef.current = nextChildren;
				setChildren(nextChildren);
				return;
			}
			if (reference === 0) return;
			const session = sessionRef.current;
			const nextExpanded = new Set(expandedRef.current);
			nextExpanded.add(row.key);
			expandedRef.current = nextExpanded;
			setExpanded(nextExpanded);
			if (session === null || childrenRef.current.has(reference)) return;
			void dapVariables(session, reference).then(
				(values) => {
					const nextChildren = new Map(childrenRef.current).set(reference, values);
					childrenRef.current = nextChildren;
					setChildren(nextChildren);
				},
				(reason) => setError(`Variables: ${describeError(reason)}`),
			);
		},
		[childrenRef, expandedRef, sessionRef, setChildren, setError, setExpanded],
	);

	const selectVariable = useCallback(
		(row: VariableRow) => {
			setSelectedVariable((current) =>
				current !== null && current.key === row.key ? null : row,
			);
		},
		[setSelectedVariable],
	);

	const setVariable = useCallback(
		async (row: VariableRow, value: string) => {
			const session = sessionRef.current;
			if (session === null) {
				setError("Set variable needs a live debug session");
				throw new Error("no session");
			}
			await dapSetVariable(session, row.containerRef, row.name, value);
			try {
				const values = await dapVariables(session, row.containerRef);
				if (sessionRef.current !== session) return;
				const next = new Map(childrenRef.current);
				next.set(row.containerRef, values);
				childrenRef.current = next;
				setChildren(next);
			} catch (reason) {
				if (sessionRef.current === session) {
					setError(`Variables: ${describeError(reason)}`);
				}
			}
			if (row.variablesReference > 0 && expandedRef.current.has(row.key)) {
				try {
					const values = await dapVariables(session, row.variablesReference);
					if (sessionRef.current !== session) return;
					const next = new Map(childrenRef.current);
					next.set(row.variablesReference, values);
					childrenRef.current = next;
					setChildren(next);
				} catch (reason) {
					if (sessionRef.current === session) {
						setError(`Variables: ${describeError(reason)}`);
					}
				}
			}
		},
		[childrenRef, expandedRef, sessionRef, setChildren, setError],
	);

	return { loadFrame, selectFrame, toggleVariable, selectVariable, setVariable };
}
