import "@/test/render";
import { describe, expect, mock, test } from "bun:test";
import * as realApi from "@/lib/project/api";
import { act, renderHook } from "@testing-library/react";
import type { FileBuffer } from "@/lib/project/buffer";
import type { EditorHandle } from "@/ui/editor/editorTypes";

/**
 * Format-on-save: `savePaths` formats from a snapshot and then writes the result into the buffer
 * (`src/ui/app/useSaveBuffers.ts:97-108`).
 *
 * The write is unconditional, so a keystroke that lands while the formatter runs is replaced by
 * the text computed before it. The file is then saved without it and `settleSave` marks the buffer
 * clean, so the loss leaves no dirty marker either.
 */

const writes: Array<{ path: string; text: string }> = [];

mock.module("@/lib/project/api", () => ({
	// The rest of the module is kept, so a later file in this worker still finds its own exports.
	...realApi,
	formatterFor: async () => "fakeformatter",
	formatDocument: async (_root: string, _path: string, text: string) => text,
	writeTextFile: async (path: string, text: string) => {
		writes.push({ path, text });
	},
	lspDidSave: async () => undefined,
}));

const { useSaveBuffers } = await import("@/ui/app/useSaveBuffers");

const PATH = "/p/a.cpp";
/** The saved text the formatter is given. */
const DOC_A = "class Widget {\n    int count;\n};\n";
/** What the formatter returns for DOC_A. */
const STALE = "class Widget {\n    int total;\n};\n";
const TYPED = "// typed while saving\n";

function buffer(text: string): FileBuffer {
	return { path: PATH, name: "a.cpp", text, loaded: text };
}

describe("format-on-save that finishes after the user typed", () => {
	test("the keystroke survives the save", async () => {
		writes.length = 0;
		let live: FileBuffer[] = [buffer(DOC_A)];
		const buffersRef = { current: live };
		const activePathRef = { current: PATH };
		const holdState = () => {
			buffersRef.current = live;
		};

		// The formatter is slow: while it runs, a keystroke replaces the buffer text.
		const formatText = async () => {
			live = [buffer(TYPED + DOC_A)];
			holdState();
			return STALE;
		};
		const editorRef = { current: { formatText, format: async () => undefined } };

		const { result } = renderHook(() =>
			useSaveBuffers({
				root: "/p",
				activePath: PATH,
				formatting: false,
				buffersRef,
				activePathRef,
				editorRef: editorRef as { current: EditorHandle | null },
				formatOnSaveRef: { current: true },
				setBuffers: (updater) => {
					live = updater(live);
					holdState();
				},
				setSaving: () => undefined,
				setSaveStatus: () => undefined,
				setFormatting: () => undefined,
				onSaved: () => undefined,
				onBatchSaved: () => undefined,
			}),
		);

		await act(async () => {
			await result.current.saveActive();
		});

		// Today: live text is STALE and the file on disk was written as STALE — both without TYPED.
		expect(live[0]?.text).toContain(TYPED);
		expect(writes.at(-1)?.text).toContain(TYPED);
	});
});
