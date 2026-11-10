import { describe, expect, test } from "bun:test";
import { runToCursorItem } from "@/ui/editor/useEditorContextMenu";
import type { EditorDebug } from "@/ui/editor/editorTypes";

function debug(overrides: Partial<EditorDebug> = {}): EditorDebug {
	return {
		stopped: true,
		path: "/work/main.rs",
		line: 12,
		runToCursor: () => undefined,
		...overrides,
	};
}

describe("the editor's Run to cursor row", () => {
	test("is in the menu while the session is stopped", () => {
		const item = runToCursorItem(7, "/work/main.rs", debug());
		expect(item.label).toBe("Run to cursor");
		expect(item.disabled).toBe(false);
	});

	test("is listed but disabled while the session is running", () => {
		const item = runToCursorItem(7, "/work/main.rs", debug({ stopped: false }));
		expect(item.label).toBe("Run to cursor");
		expect(item.disabled).toBe(true);
	});

	test("is disabled with no debugger at all", () => {
		expect(runToCursorItem(7, "/work/main.rs", undefined).disabled).toBe(true);
	});

	test("is disabled when the editor holds no file", () => {
		expect(runToCursorItem(7, null, debug()).disabled).toBe(true);
	});

	test("runs to the clicked line in the open file, not the stopped one", () => {
		const calls: [string, number][] = [];
		const item = runToCursorItem(7, "/work/other.rs", {
			...debug(),
			runToCursor: (path, line) => calls.push([path, line]),
		});
		item.onSelect();
		expect(calls).toEqual([["/work/other.rs", 7]]);
	});
});
