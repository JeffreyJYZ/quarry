import type { DapVariable } from "@/lib/project/api";

/** A pinned variable: re-read by walking `path` then `name` from `scopeReference`. */
export type Pin = {
	scopeReference: number;
	name: string;
	path: string[];
};

/** Result of one pinned re-read. */
export type PinResult = {
	value: string;
	typeName: string | null;
	missing: boolean;
	unavailable: boolean;
};

/** Stable identity for a pin, used for sets and map keys. */
export function pinKey(pin: Pin): string {
	return `${pin.scopeReference}:${pin.path.join("/")}:${pin.name}`;
}

/**
 * Walk an already-fetched children map along `pin.path` then `pin.name`. Returns the matching
 * variable, or null when any segment is absent. Pure: no fetching.
 */
export function walkPin(
	children: ReadonlyMap<number, readonly DapVariable[]>,
	pin: Pin,
): DapVariable | null {
	const names = [...pin.path, pin.name];
	let reference = pin.scopeReference;
	let found: DapVariable | null = null;
	for (let index = 0; index < names.length; index += 1) {
		const name = names[index];
		const list = children.get(reference);
		if (list === undefined) return null;
		const match = list.find((variable) => variable.name === name);
		if (match === undefined) return null;
		found = match;
		if (index < names.length - 1) {
			if (match.variablesReference === 0) return null;
			reference = match.variablesReference;
		}
	}
	return found;
}
