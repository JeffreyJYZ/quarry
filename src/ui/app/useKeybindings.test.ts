import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { type KeybindingContext, useKeybindings } from "@/ui/app/useKeybindings";

type Handlers = {
	context: KeybindingContext;
	setShortcutsOpen: ReturnType<typeof mock>;
	setRailCollapsed: ReturnType<typeof mock>;
	setPanelOpen: ReturnType<typeof mock>;
	showDebugger: ReturnType<typeof mock>;
	showTodos: ReturnType<typeof mock>;
	setGitOpen: ReturnType<typeof mock>;
};

function keybindings(): Handlers {
	const setShortcutsOpen = mock((_updater: (current: boolean) => boolean) => {});
	const setRailCollapsed = mock((_updater: (current: boolean) => boolean) => {});
	const setPanelOpen = mock((_open: boolean) => {});
	const showDebugger = mock(() => {});
	const showTodos = mock(() => {});
	const setGitOpen = mock((_updater: (current: boolean) => boolean) => {});
	const context: KeybindingContext = {
		root: "/tmp/project",
		activePath: "/tmp/project/main.rs",
		cursor: { line: 0, character: 0 },
		panelExpanded: false,
		railCollapsed: false,
		gitOpen: false,
		activePathRef: { current: "/tmp/project/main.rs" },
		runToCursor: mock(() => {}),
		saveActive: mock(() => {}),
		saveAll: mock(() => {}),
		formatActive: mock(() => {}),
		setShortcutsOpen,
		setRailCollapsed,
		setPanelOpen,
		showDebugger,
		showTodos,
		setGitOpen,
		setCommandPaletteOpen: mock(() => {}),
		setFileRevealToken: mock(() => {}),
		setQuickOpenOpen: mock(() => {}),
		setSearchOpen: mock(() => {}),
		setCallsCursor: mock(() => {}),
		setCallsOpen: mock(() => {}),
		setTypeHierarchyCursor: mock(() => {}),
		setTypeHierarchyOpen: mock(() => {}),
		zoomEditor: mock(() => {}),
		closeActiveTab: mock(() => {}),
		cycleTab: mock(() => {}),
		reopenClosedTab: mock(() => {}),
		restartLsp: mock(() => {}),
	};
	renderHook(() => useKeybindings(context));
	return {
		context,
		setShortcutsOpen,
		setRailCollapsed,
		setPanelOpen,
		showDebugger,
		showTodos,
		setGitOpen,
	};
}

/** A caret inside a file: CodeMirror's contenteditable content, the way the editor holds focus. */
function focusEditor(): HTMLElement {
	const editor = document.createElement("div");
	editor.className = "cm-editor";
	const content = document.createElement("div");
	content.className = "cm-content";
	content.setAttribute("contenteditable", "true");
	editor.appendChild(content);
	document.body.appendChild(editor);
	content.focus();
	return content;
}

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe("the shortcut sheet key", () => {
	test("Shift+? opens the sheet outside the editor", () => {
		const keys = keybindings();

		const handled = fireEvent.keyDown(document.body, { key: "?", shiftKey: true });

		expect(handled).toBe(false);
		expect(keys.setShortcutsOpen).toHaveBeenCalledTimes(1);
		const updater = keys.setShortcutsOpen.mock.calls[0][0] as (current: boolean) => boolean;
		expect(updater(false)).toBe(true);
	});

	test("? typed in the editor belongs to the editor", () => {
		const keys = keybindings();
		const content = focusEditor();

		fireEvent.keyDown(content, { key: "?", shiftKey: true });

		expect(keys.setShortcutsOpen).not.toHaveBeenCalled();
	});
});

describe("the layout toggles", () => {
	test("Cmd+Shift+D reaches the debugger from inside a file", () => {
		const keys = keybindings();
		const content = focusEditor();

		const handled = fireEvent.keyDown(content, { key: "D", metaKey: true, shiftKey: true });

		expect(handled).toBe(false);
		expect(keys.showDebugger).toHaveBeenCalledTimes(1);
	});

	test("Cmd+6 selects the TODO tool window from inside a file", () => {
		const keys = keybindings();
		const content = focusEditor();

		const handled = fireEvent.keyDown(content, { key: "6", metaKey: true });

		expect(handled).toBe(false);
		expect(keys.showTodos).toHaveBeenCalledTimes(1);
	});

	test("Cmd+Shift+G toggles source control from inside a file", () => {
		const keys = keybindings();
		const content = focusEditor();

		const handled = fireEvent.keyDown(content, { key: "G", metaKey: true, shiftKey: true });

		expect(handled).toBe(false);
		expect(keys.setGitOpen).toHaveBeenCalledTimes(1);
		const updater = keys.setGitOpen.mock.calls[0][0] as (current: boolean) => boolean;
		expect(updater(false)).toBe(true);
	});

	test("the chords the editor claims stay with the editor", () => {
		const keys = keybindings();
		const content = focusEditor();

		/* The editor's keymaps own Cmd+D (next occurrence) and Cmd+G (next match); Cmd+B is the
		   webview's own bold on its contenteditable surface. */
		expect(fireEvent.keyDown(content, { key: "d", metaKey: true })).toBe(true);
		expect(fireEvent.keyDown(content, { key: "g", metaKey: true })).toBe(true);
		expect(fireEvent.keyDown(content, { key: "b", metaKey: true })).toBe(true);

		expect(keys.showDebugger).not.toHaveBeenCalled();
		expect(keys.setGitOpen).not.toHaveBeenCalled();
		expect(keys.setRailCollapsed).not.toHaveBeenCalled();
		expect(keys.setPanelOpen).not.toHaveBeenCalled();
	});
});
