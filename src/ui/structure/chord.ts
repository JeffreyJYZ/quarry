/**
 * The File Structure chord.
 *
 * F12 alone is go to definition, Shift+F12 find references and Alt+F12 the terminal, so the meta
 * chord is the one left on that key. It is not a native menu accelerator, which would take the
 * chord before the webview ever saw it.
 */
export function isStructureChord(event: {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}): boolean {
	return (
		event.key === "F12" && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
	);
}
