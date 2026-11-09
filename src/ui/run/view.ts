import type { RunLine } from "@/lib/run/runOutput";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Colour sequences are for a terminal, never for the console text or the copied log. */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

/** The class a row uses, so stderr reads as an error without a second component. */
export function lineClass(stream: RunLine["stream"]): string {
	return stream === "stderr" ? "run-line stderr" : "run-line";
}

/** The Stop button's label: it says the backend was asked, not that the process is gone yet. */
export function stopLabel(stopping: boolean): string {
	return stopping ? "Stopping…" : "Stop";
}

/** What "Copy output" puts on the clipboard: every row, escapes stripped, one line each. */
export function copyText(lines: RunLine[]): string {
	return lines.map((entry) => stripAnsi(entry.line)).join("\n");
}
