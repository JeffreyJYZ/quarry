import "@/test/render";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@/test/render";
import Editor from "@/ui/editor/Editor";

/**
 * The context menu's "Format document" row is the same action as the keyboard one.
 *
 * `src/ui/editor/Editor.tsx:128` used to wire it as `() => void runFormatText()`, which runs the
 * formatter and drops the text it returns: the menu item formatted nothing. These tests pin the
 * row to the full action, so a result is applied and a failure is reported through the editor's
 * notice channel instead of doing nothing.
 *
 * A JSON buffer exercises the formatter without the backend: that path is the frontend formatter
 * (`formatJsonText`), so no module mock is needed and nothing leaks into the neighbouring tests.
 */

const SOURCE = '{"b":2,"a":1}';
const FORMATTED = '{\n  "b": 2,\n  "a": 1\n}';

function openFormatRow(value: string) {
	const changes: string[] = [];
	const notices: (string | null)[] = [];
	const view = render(
		<Editor
			path="/p/package.json"
			root="/p"
			value={value}
			onChange={(text) => changes.push(text)}
			onNotice={(message) => notices.push(message)}
		/>,
	);
	const host = document.querySelector(".editor-host");
	if (host === null) throw new Error("the editor host is missing");
	// A negative Y lands above the document, so the menu places itself without depending on the
	// layout happy-dom does not compute.
	fireEvent.contextMenu(host, { clientX: 12, clientY: -12 });
	return { changes, notices, view };
}

async function selectFormat(view: ReturnType<typeof render>): Promise<void> {
	const row = await view.findByRole("menuitem", { name: "Format document" });
	await act(async () => {
		fireEvent.click(row);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe("the context menu's Format document row", () => {
	afterEach(() => cleanup());

	test("applies the text the formatter returns", async () => {
		const { changes, notices, view } = openFormatRow(SOURCE);
		await selectFormat(view);

		expect(changes.at(-1)).toBe(FORMATTED);
		expect(notices).toEqual([]);
	});

	test("reports an unformattable document instead of doing nothing", async () => {
		const { changes, notices, view } = openFormatRow('{"a":');
		await selectFormat(view);

		await waitFor(() => expect(notices.length).toBeGreaterThan(0));
		expect(notices[0]).toContain("cannot format package.json: invalid JSON");
		expect(changes).toEqual([]);
	});
});
