import type { IBufferLine, ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { findUrls } from "@/lib/terminal/urls";

/** One cell of a buffer line: the character it holds, and the column it starts at. */
type Cell = { text: string; column: number; width: number };

/**
 * A line's text with each character's cell position.
 *
 * Walking cells rather than indexing the trimmed string is what keeps a wide character honest: a CJK
 * glyph or an emoji holds one screen position but two columns, so a character offset and a cell
 * offset are not the same number after one appears.
 */
function cellsOf(line: IBufferLine): { text: string; cells: Cell[] } {
	let text = "";
	// One entry per UTF-16 unit, not per cell: an emoji is two units in `text`, so a character offset
	// from the scan would otherwise index the wrong cell after one appears on the line.
	const cells: Cell[] = [];
	for (let column = 0; column < line.length; column += 1) {
		const cell = line.getCell(column);
		if (cell === undefined) break;
		const width = cell.getWidth();
		// Zero width is the right half of the character before it, which is already counted.
		if (width === 0) continue;
		const chars = cell.getChars();
		const piece = chars === "" ? " " : chars;
		const entry = { text: piece, column: column + 1, width };
		for (let unit = 0; unit < piece.length; unit += 1) cells.push(entry);
		text += piece;
	}
	return { text: text.trimEnd(), cells };
}

/**
 * Command-clickable web addresses in terminal output.
 *
 * The link is offered for every line the emulator asks about rather than precomputed per chunk: a
 * progress bar rewrites a line in place, so a cached range would point at text that has moved.
 *
 * A plain click is left alone — the terminal owns clicks for selection and for a TUI that reports its
 * own mouse — so only Cmd (or Ctrl) opens the browser.
 */
export function registerTerminalLinks(term: Terminal): { dispose: () => void } {
	const provider: ILinkProvider = {
		provideLinks(bufferLineNumber, callback) {
			const line = term.buffer.active.getLine(bufferLineNumber - 1);
			if (line === undefined) {
				callback(undefined);
				return;
			}
			const { text, cells } = cellsOf(line);
			if (!text.includes("http")) {
				callback(undefined);
				return;
			}
			const links: ILink[] = [];
			for (const found of findUrls(text)) {
				const first = cells[found.start];
				const last = cells[found.end - 1];
				if (first === undefined || last === undefined) continue;
				links.push({
					text: found.url,
					range: {
						start: { x: first.column, y: bufferLineNumber },
						end: { x: last.column + last.width - 1, y: bufferLineNumber },
					},
					activate(event: MouseEvent) {
						if (!event.metaKey && !event.ctrlKey) return;
						event.preventDefault();
						void openUrl(found.url).catch(() => undefined);
					},
				});
			}
			callback(links.length === 0 ? undefined : links);
		},
	};

	const disposable = term.registerLinkProvider(provider);
	return { dispose: () => disposable.dispose() };
}
