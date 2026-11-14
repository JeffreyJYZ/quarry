import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import type { Diagnostic } from "@/lib/project/api";
import { toLintDiagnostics } from "@/lib/editor/diagnostics";

/**
 * Server diagnostics are pushed for the document the server last saw, and published when the feed
 * delivers them — which can be after the user typed.
 *
 * `src/lib/editor/diagnostics.ts:14-19` clamps line and character onto the live state before a
 * range is built, and `src/ui/editor/useDiagnosticsPublish.ts:21` maps against `view.state` at
 * publish time, so a stale finding lands in the wrong place instead of throwing.
 */

const state = EditorState.create({ doc: "one\ntwo\nthree\n" });

function finding(line: number, character: number): Diagnostic {
	return {
		path: "/p/a.cpp",
		range: { start: { line, character }, end: { line, character: character + 4 } },
		severity: 1,
		message: "stale",
		source: "clangd",
	};
}

describe("a diagnostic computed against a longer document", () => {
	test("is clamped onto the live document, not thrown", () => {
		const mapped = toLintDiagnostics(state, [finding(99, 99)]);
		const [entry] = mapped;

		expect(entry.from).toBeGreaterThanOrEqual(0);
		expect(entry.to).toBeLessThanOrEqual(state.doc.length);
		expect(entry.to).toBeGreaterThanOrEqual(entry.from);
	});

	test("a zero-width range past the end still draws one character", () => {
		const mapped = toLintDiagnostics(state, [finding(2, 0)]);
		expect(mapped[0].to).toBeGreaterThan(mapped[0].from);
	});
});
