/**
 * Whether a search result still belongs to the query the user is waiting for.
 *
 * A search is a sequence of tickets: starting a new one retires every earlier one, and a late answer
 * that arrives under a retired ticket must never overwrite a newer result.
 */
export function isStaleSearch(ticket: number, current: number): boolean {
	return ticket !== current;
}

/** Run `apply` only when this ticket is still the newest. */
export function whenCurrent(ticket: number, current: number, apply: () => void): void {
	if (!isStaleSearch(ticket, current)) apply();
}
