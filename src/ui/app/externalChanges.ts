/**
 * Keeping open buffers in step with disk after an external change.
 *
 * The decision belongs to `src/lib/project/watch.ts` and stays pure; this module only performs what
 * that decision allowed. A buffer is replaced only while it is still clean, checked again after the
 * read returns, so an edit that lands during the read is never thrown away. A delete or rename is a
 * batch decision too: `planWatchBatch` pairs one vanished path with one created path of the same
 * name, and anything it cannot pair keeps its tab and its text.
 */

import type { Dispatch, RefObject, SetStateAction } from "react";
import { listDir, readTextFile } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";
import { baseName, planWatchBatch } from "@/lib/project/watch";

/** The buffer after a clean reload, or `null` when replacing it is no longer safe or needed. */
export function reloaded(entry: FileBuffer, text: string): FileBuffer | null {
	if (entry.text !== entry.loaded || entry.loaded === text) return null;
	return { ...entry, text, loaded: text };
}

/** The live tree the handler reads: injectable so the batch decision is testable without Tauri. */
export type ExternalChangeIo = {
	read: (path: string) => Promise<string>;
	/** Whether `path` is still a file. A probe that cannot answer says `true`, never `false`. */
	exists: (path: string) => Promise<boolean>;
};

/** State that lives outside the buffer list and follows a close or a move. */
export type ExternalChangeActions = {
	onClosed?: (path: string) => void;
	onMoved?: (from: string, to: string) => void;
};

/**
 * A path is gone only when its parent lists and the name is absent.
 *
 * A failed listing answers `true`: a permission error or a vanished parent must never be read as a
 * delete, which would close a tab over a file that is still there.
 */
async function fileExists(path: string): Promise<boolean> {
	const cut = path.lastIndexOf("/");
	if (cut <= 0) return true;
	try {
		const entries = await listDir(path.slice(0, cut));
		return entries.some((entry) => entry.path === path && !entry.isDir);
	} catch {
		return true;
	}
}

const defaultIo: ExternalChangeIo = { read: readTextFile, exists: fileExists };

/** Build the handler the watcher calls with each batch of changed paths. */
export function externalChangeHandler(
	refs: { buffers: RefObject<FileBuffer[]>; mounted: RefObject<boolean> },
	setBuffers: Dispatch<SetStateAction<FileBuffer[]>>,
	onNotice: (message: string) => void,
	io: ExternalChangeIo = defaultIo,
	actions: ExternalChangeActions = {},
): (paths: string[], afterBatch?: () => void) => Promise<void> {
	return async (paths, afterBatch) => {
		const buffers = refs.buffers.current;
		const changed = new Set(paths);
		const open = new Set(buffers.map((buffer) => buffer.path));
		const touched = buffers.filter((buffer) => changed.has(buffer.path));

		// Only paths with an open tab, or a name a vanished tab carries, are worth a disk probe.
		const existing = new Set<string>();
		const probes = await Promise.all(
			touched.map(async (buffer) => ({
				path: buffer.path,
				there: await io.exists(buffer.path),
			})),
		);
		for (const probe of probes) if (probe.there) existing.add(probe.path);
		const vanishedNames = new Set(
			touched.filter((buffer) => !existing.has(buffer.path)).map((buffer) => buffer.name),
		);
		const candidates = paths.filter(
			(path) => !open.has(path) && vanishedNames.has(baseName(path)),
		);
		const found = await Promise.all(
			candidates.map(async (path) => ({ path, there: await io.exists(path) })),
		);
		for (const probe of found) if (probe.there) existing.add(probe.path);
		if (!refs.mounted.current) return;

		const plan = planWatchBatch(buffers, paths, existing);
		for (const message of plan.notices) onNotice(message);
		if (plan.conflicts.length > 0) {
			const names = plan.conflicts.map((buffer) => buffer.name).join(", ");
			onNotice(`Changed on disk: ${names} (unsaved changes kept)`);
		}

		const texts = new Map<string, string>();
		await Promise.all(
			plan.reload.map(async (buffer) => {
				try {
					texts.set(buffer.path, await io.read(buffer.path));
				} catch (error) {
					if (refs.mounted.current) {
						onNotice(`Could not reload ${buffer.name}: ${describeError(error)}`);
					}
				}
			}),
		);
		if (!refs.mounted.current) return;

		const moves = new Map(plan.moves.map((move) => [move.buffer.path, move]));
		const closed = new Set(plan.close.map((buffer) => buffer.path));
		setBuffers((current) => {
			const next: FileBuffer[] = [];
			for (const entry of current) {
				if (closed.has(entry.path)) continue;
				const move = moves.get(entry.path);
				if (move !== undefined) {
					next.push({ ...entry, path: move.to, name: move.name });
					continue;
				}
				const text = texts.get(entry.path);
				next.push(text === undefined ? entry : (reloaded(entry, text) ?? entry));
			}
			return next;
		});
		for (const buffer of plan.close) actions.onClosed?.(buffer.path);
		for (const move of plan.moves) actions.onMoved?.(move.buffer.path, move.to);
		afterBatch?.();
	};
}
