/**
 * Turning what the user typed into an address.
 *
 * The field takes anything the debugger can evaluate — `&count`, `head->next`, `&v.items[2]` — and
 * only a value the adapter reports as an address can be read, so the conversion is its own small
 * unit rather than a regex buried in the pane.
 */

/** One leading cast, including one level of nesting so `(int (*)(void))` is stripped too. */
const CAST = /^\((?:[^()]|\([^()]*\))*\)\s*/;

/**
 * The address a debugger value names, or `null` when it names none.
 *
 * The whole value has to be the literal: `&x` answers `0x000000016fdfe9a8` and a typed pointer the
 * same shape, with an optional cast in front. A scalar's value (`2`) is a number, not a location,
 * and a struct dump can carry a hex field that must not be mistaken for one, so anything with more
 * than the literal is `null` and the pane explains what it got.
 */
export function addressFromValue(value: string): bigint | null {
	let rest = value.trim();
	let stripped = true;
	while (stripped) {
		const next = rest.replace(CAST, "");
		stripped = next !== rest;
		rest = next.trim();
	}
	if (/^0x[0-9a-fA-F]+$/.test(rest)) {
		return BigInt(rest);
	}
	if (/^\d+$/.test(rest)) {
		return BigInt(rest);
	}
	return null;
}
