/**
 * What one click on a folder row means.
 *
 * Opening a folder always re-lists it: its contents may have changed while it was collapsed, and a
 * settled listing from before a rename or an external edit would put files back that are gone.
 * Closing touches nothing, so a subtree's listings stay settled until it is opened again.
 */

export type TogglePlan = {
	/** Whether the folder is opening, i.e. was closed. */
	open: boolean;
	/** The expansion set after the click. */
	expanded: Set<string>;
	/** Whether the folder's listing has to be read again. */
	relist: boolean;
};

export function planToggle(expanded: ReadonlySet<string>, path: string): TogglePlan {
	const open = !expanded.has(path);
	const next = new Set(expanded);
	if (open) next.add(path);
	else next.delete(path);
	return { open, expanded: next, relist: open };
}
