#!/usr/bin/env bun
/**
 * DAP framing, apart from the process that produces it.
 *
 * A `Content-Length` header and a JSON body, possibly split across two reads. Kept as a pure function
 * so the one thing that cannot be debugged by eye — where a frame ends — is testable without a child
 * process, and so the client file is about the child rather than about string slicing.
 */

type Json = Record<string, unknown>;

/** What one read of the stream completed: whole messages, and the bytes of an unfinished one. */
export interface Framed {
	messages: Json[];
	rest: string;
}

/** Every complete message at the front of `buffer`, in order, and what is left over. */
export function readFrames(buffer: string): Framed {
	const messages: Json[] = [];
	let rest = buffer;
	for (;;) {
		const header = rest.indexOf("\r\n\r\n");
		if (header < 0) return { messages, rest };
		const match = /Content-Length: (\d+)/i.exec(rest.slice(0, header));
		if (match === null) return { messages, rest };
		const length = Number(match[1]);
		const start = header + 4;
		if (rest.length < start + length) return { messages, rest };
		messages.push(JSON.parse(rest.slice(start, start + length)) as Json);
		rest = rest.slice(start + length);
	}
}
