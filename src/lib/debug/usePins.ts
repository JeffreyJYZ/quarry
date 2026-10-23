import { useCallback } from "react";
import { type DapVariable, dapVariables } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { type Pin, type PinResult, pinKey } from "@/lib/debug/watch";
import type { StopView, VariableRow } from "./sessionTypes";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

/** Pinned variables: read by walking the scope tree on every stop, and their last known values. */
export function usePins(options: {
	sessionRef: { current: string | null };
	stopRef: { current: StopView | null };
	pinsRef: { current: Pin[] };
	setPins: Setter<Pin[]>;
	setPinResults: Setter<Map<string, PinResult>>;
	setError: (message: string | null) => void;
}) {
	const { sessionRef, stopRef, pinsRef, setPins, setPinResults, setError } = options;

	const readPin = useCallback(async (session: string, pin: Pin) => {
		const names = [...pin.path, pin.name];
		let reference = pin.scopeReference;
		let list = await dapVariables(session, reference);
		let found: DapVariable | null = null;
		for (let index = 0; index < names.length; index += 1) {
			const name = names[index];
			found = list.find((variable) => variable.name === name) ?? null;
			if (found === null) return null;
			if (index < names.length - 1) {
				if (found.variablesReference === 0) return null;
				reference = found.variablesReference;
				list = await dapVariables(session, reference);
			}
		}
		return found;
	}, []);

	const refreshPins = useCallback(
		async (session: string) => {
			const current = pinsRef.current;
			if (current.length === 0) {
				setPinResults(new Map());
				return;
			}
			const next = new Map<string, PinResult>();
			let firstError: string | null = null;
			for (const pin of current) {
				try {
					const variable = await readPin(session, pin);
					if (variable === null) {
						next.set(pinKey(pin), {
							value: "",
							typeName: null,
							missing: true,
							unavailable: false,
						});
					} else {
						next.set(pinKey(pin), {
							value: variable.value,
							typeName: variable.typeName,
							missing: false,
							unavailable: false,
						});
					}
				} catch (reason) {
					next.set(pinKey(pin), {
						value: "unavailable",
						typeName: null,
						missing: false,
						unavailable: true,
					});
					if (firstError === null) firstError = `Watch: ${describeError(reason)}`;
				}
			}
			if (sessionRef.current === session) {
				setPinResults(next);
				if (firstError !== null) setError(firstError);
			}
		},
		[readPin, pinsRef, sessionRef, setPinResults, setError],
	);

	const pinVariable = useCallback(
		(row: VariableRow) => {
			const pin: Pin = {
				scopeReference: row.scopeReference,
				name: row.name,
				path: [...row.path],
			};
			setPins((current) => {
				if (current.some((entry) => pinKey(entry) === pinKey(pin))) return current;
				const next = [...current, pin];
				pinsRef.current = next;
				return next;
			});
			const session = sessionRef.current;
			if (session !== null && stopRef.current !== null) void refreshPins(session);
		},
		[refreshPins, sessionRef, stopRef, pinsRef, setPins],
	);

	const unpinVariable = useCallback(
		(pin: Pin) => {
			setPins((current) => {
				const next = current.filter((entry) => pinKey(entry) !== pinKey(pin));
				pinsRef.current = next;
				return next;
			});
			setPinResults((current) => {
				const next = new Map(current);
				next.delete(pinKey(pin));
				return next;
			});
		},
		[pinsRef, setPins, setPinResults],
	);

	const togglePin = useCallback(
		(row: VariableRow) => {
			const pin: Pin = {
				scopeReference: row.scopeReference,
				name: row.name,
				path: [...row.path],
			};
			if (pinsRef.current.some((entry) => pinKey(entry) === pinKey(pin))) unpinVariable(pin);
			else pinVariable(row);
		},
		[pinVariable, unpinVariable, pinsRef],
	);

	const isPinned = useCallback(
		(row: VariableRow) => {
			const pin: Pin = {
				scopeReference: row.scopeReference,
				name: row.name,
				path: [...row.path],
			};
			return pinsRef.current.some((entry) => pinKey(entry) === pinKey(pin));
		},
		[pinsRef],
	);

	return { readPin, refreshPins, pinVariable, unpinVariable, togglePin, isPinned };
}
