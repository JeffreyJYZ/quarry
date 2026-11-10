import { useEffect, useRef } from "react";
import { isRustPath } from "@/lib/consts/extensions";
import type { FileBuffer } from "@/lib/project/buffer";
import type { ProjectKind } from "@/lib/project/api";
import type { TestsController } from "@/lib/tests/useTests";

/** A Rust file worth a discovery run: it mentions a test attribute somewhere. */
const LIKELY_TEST = /#\[[^\n]*\btest\b/;

/**
 * Keeps the backend's test list in step with the editor.
 *
 * Discovery compiles the workspace, so it is asked for only where tests can be — a Rust file in a
 * Cargo project whose text names a test — and refreshed when a save or a disk reload replaces that
 * file's text. Both are the moments a test can appear or disappear.
 */
export function useTestRefresh(
	tests: TestsController,
	options: { projectKind: ProjectKind | null; activePath: string | null; buffers: FileBuffer[] },
): void {
	const { projectKind, activePath, buffers } = options;
	const { load, reload } = tests;
	const active = buffers.find((buffer) => buffer.path === activePath) ?? null;
	const text = active?.text ?? "";

	useEffect(() => {
		if (projectKind !== "cargo" || activePath === null || !isRustPath(activePath)) return;
		if (!LIKELY_TEST.test(text)) return;
		load();
	}, [projectKind, activePath, text, load]);

	/** What each Rust buffer looked like when it was last seen, so a change is one comparison. */
	const seen = useRef(new Map<string, { loaded: string; loadId: number }>());
	useEffect(() => {
		const next = new Map<string, { loaded: string; loadId: number }>();
		for (const buffer of buffers) {
			if (!isRustPath(buffer.path)) continue;
			const entry = { loaded: buffer.loaded, loadId: buffer.loadId ?? 0 };
			next.set(buffer.path, entry);
			const previous = seen.current.get(buffer.path);
			if (
				previous !== undefined &&
				(previous.loaded !== entry.loaded || previous.loadId !== entry.loadId)
			) {
				reload();
			}
		}
		seen.current = next;
	}, [buffers, reload]);
}
