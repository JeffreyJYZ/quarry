import { MAX_RUN_LINES } from "@/lib/consts/run";

/** One console row: a chunk of one stream, numbered so arrival order is also program order. */
export type RunLine = {
	/** Unique within the run, strictly increasing, and the row's React key. */
	seq: number;
	stream: "stdout" | "stderr";
	line: string;
	/** The same row continues in a later chunk of this stream, so the next one appends to it. */
	open: boolean;
};

/** One `run://output` event: a chunk of a line, which may finish the row or continue it. */
export type OutputChunk = {
	seq: number;
	stream: string;
	line: string;
	more: boolean;
};

export type OutputEvent = OutputChunk & { runId: string };

/** One `run://exited` event: how the child ended, emitted after the last line of the run. */
export type ExitedEvent = {
	runId: string;
	seq: number;
	code: number | null;
	signal: number | null;
};

/** An event that arrived before the run id was known, so it is held until the run starts. */
export type PendingEvent =
	{ kind: "output"; event: OutputEvent } | { kind: "exited"; event: ExitedEvent };

/** How a run ended, as the panel shows it: the code or the signal, and whether Stop did it. */
export type RunExit = {
	code: number | null;
	signal: number | null;
	killed: boolean;
};

/** Only the events of the run that actually started; anything else belongs to a stale run. */
export function bufferedFor(pending: PendingEvent[], runId: string): PendingEvent[] {
	return pending.filter((entry) => entry.event.runId === runId);
}

function streamOf(name: string): RunLine["stream"] {
	return name === "stderr" ? "stderr" : "stdout";
}

/**
 * Append one chunk to the console, keeping the rows in sequence order.
 *
 * A chunk whose `more` is set opens a row instead of closing it: the next chunk of the same stream
 * appends to that row, so output without a newline (a prompt, a progress bar) shows as one growing
 * line rather than one row per read. The backend numbers the chunks from a single emitter, so the
 * numbers are the program's write order; sorting by them keeps stdout and stderr interleaved even
 * if two events are delivered out of order.
 */
export function appendOutput(lines: RunLine[], event: OutputChunk): RunLine[] {
	const row: RunLine = {
		seq: event.seq,
		stream: streamOf(event.stream),
		line: event.line,
		open: event.more,
	};
	const last = lines[lines.length - 1];
	if (last === undefined || last.seq < row.seq) {
		if (last?.open && last.stream === row.stream) {
			return capped([...lines.slice(0, -1), mergeRows(last, row)]);
		}
		return capped([...lines, row]);
	}
	return capped(mergeOpen(insertBySeq(lines, row)));
}

function mergeRows(previous: RunLine, row: RunLine): RunLine {
	return { ...previous, line: previous.line + row.line, open: row.open };
}

function insertBySeq(lines: RunLine[], row: RunLine): RunLine[] {
	let index = lines.length;
	while (index > 0 && lines[index - 1].seq > row.seq) {
		index -= 1;
	}
	return [...lines.slice(0, index), row, ...lines.slice(index)];
}

/** Merge every run of rows where an open row is followed by the same stream. */
function mergeOpen(lines: RunLine[]): RunLine[] {
	const merged: RunLine[] = [];
	for (const row of lines) {
		const previous = merged[merged.length - 1];
		if (previous?.open && previous.stream === row.stream) {
			merged[merged.length - 1] = mergeRows(previous, row);
			continue;
		}
		merged.push(row);
	}
	return merged;
}

function capped(lines: RunLine[]): RunLine[] {
	if (lines.length <= MAX_RUN_LINES) {
		return lines;
	}
	return lines.slice(lines.length - MAX_RUN_LINES);
}

/**
 * Append lines the process never printed, such as why it could not be started.
 *
 * Each one is a closed stderr row numbered after the last, so it sits where the console already is
 * instead of colliding with a sequence number the backend owns.
 */
export function appendNotice(lines: RunLine[], messages: string[]): RunLine[] {
	let next = lines;
	let seq = lines[lines.length - 1]?.seq ?? 0;
	for (const message of messages) {
		seq += 1;
		next = appendOutput(next, { seq, stream: "stderr", line: message, more: false });
	}
	return next;
}
