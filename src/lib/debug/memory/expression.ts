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
 * lldb-dap prints an expression as `<type> $N = <value>`, and a pointer's value is a hex address:
 * `(int *) $0 = 0x00000001feb30180`. Only a hex assignment is taken, because a scalar's `= 2` names
 * a number rather than a location and the pane says so instead of reading address 2.
 */
const HEX_ASSIGNMENT = /=\s*(0x[0-9a-fA-F]+)\s*$/;

/**
 * The address a debugger value names, or `null` when it names none.
 *
 * Both shapes the adapter uses are accepted — the bare literal (`0x…`, a typed pointer without an
 * assignment) and the assigned one above. A struct dump can carry a hex field that must not be
 * mistaken for an address, so anything that is not one of those shapes is `null` and the pane
 * explains what it got.
 */
export function addressFromValue(value: string): bigint | null {
	let rest = value.trim();
	const assigned = HEX_ASSIGNMENT.exec(rest);
	if (assigned !== null) {
		rest = assigned[1];
	}
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
