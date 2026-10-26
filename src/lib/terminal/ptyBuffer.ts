import { parseOsc7Cwd } from "@/lib/terminal/fontSize";
import { appendData, type Session } from "@/lib/terminal/sessions";

/**
 * Output that arrives before its session knows which PTY it belongs to.
 *
 * `pty_open` spawns the shell and answers with an id; the shell's prompt is emitted before that
 * answer lands, so chunks arrive with an id no session carries yet. Dropping them leaves the panel
 * blank until something new is typed, so they wait here and are replayed on the session that claims
 * the id.
 */

/** A chatty shell may emit faster than the handshake completes; keep the newest output. */
export const MAX_CHUNKS = 64;
export const MAX_CHARS = 64 * 1024;

/** Abandoned ids are never claimed again, so the map itself is capped too. */
export const MAX_IDS = 8;

/** Applies one PTY chunk to a session: scrollback first, then the OSC 7 cwd trail. */
export function withChunk(session: Session, data: string): Session {
	const next = appendData(session, data);
	const cwd = parseOsc7Cwd(data);
	return cwd === null ? next : { ...next, cwd };
}

/** Replays buffered chunks in arrival order, over a session that has just gained its `ptyId`. */
export function applyChunks(session: Session, chunks: string[]): Session {
	let next = session;
	for (const data of chunks) next = withChunk(next, data);
	return next;
}

export class PtyBuffer {
	private readonly chunks = new Map<string, string[]>();
	private readonly chars = new Map<string, number>();

	/** Oldest-first eviction: a chatty shell must not grow this without bound. */
	push(id: string, data: string): void {
		if (data === "") return;
		const chunks = this.chunks.get(id) ?? [];
		chunks.push(data);
		let size = (this.chars.get(id) ?? 0) + data.length;
		while (chunks.length > MAX_CHUNKS || (size > MAX_CHARS && chunks.length > 1)) {
			size -= (chunks.shift() ?? "").length;
		}
		if (!this.chars.has(id)) this.forgetId();
		this.chunks.set(id, chunks);
		this.chars.set(id, size);
	}

	has(id: string): boolean {
		return (this.chunks.get(id) ?? []).length > 0;
	}

	/** Returns the buffered chunks and forgets them, so a replay happens exactly once. */
	take(id: string): string[] {
		const chunks = this.chunks.get(id) ?? [];
		this.discard(id);
		return chunks;
	}

	discard(id: string): void {
		this.chunks.delete(id);
		this.chars.delete(id);
	}

	/** Count of buffered ids, for tests and for the cap above. */
	get size(): number {
		return this.chunks.size;
	}

	/** Drops the oldest id once the map is full; its output is stale anyway. */
	private forgetId(): void {
		if (this.chunks.size < MAX_IDS) return;
		const oldest = this.chunks.keys().next();
		if (!oldest.done) this.discard(oldest.value);
	}
}
