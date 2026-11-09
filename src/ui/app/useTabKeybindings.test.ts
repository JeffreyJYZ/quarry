import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { useTabKeybindings } from "@/ui/app/useTabKeybindings";

type Handlers = {
	closeActiveTab: ReturnType<typeof mock>;
	cycleTab: ReturnType<typeof mock>;
	reopenClosedTab: ReturnType<typeof mock>;
};

function keybindings(): Handlers {
	const closeActiveTab = mock(() => {});
	const cycleTab = mock((_step: number) => {});
	const reopenClosedTab = mock(() => {});
	renderHook(() => useTabKeybindings({ closeActiveTab, cycleTab, reopenClosedTab }));
	return { closeActiveTab, cycleTab, reopenClosedTab };
}

/** A focused element inside the emulator, the way a shell's screen holds the keyboard. */
function focusTerminal(): HTMLElement {
	const screen = document.createElement("div");
	screen.className = "xterm";
	const field = document.createElement("textarea");
	screen.appendChild(field);
	document.body.appendChild(screen);
	field.focus();
	return screen;
}

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe("the editor tab keybindings", () => {
	test("a chord typed into the terminal never reaches the tab handler", () => {
		const keys = keybindings();
		const screen = focusTerminal();
		const target = document.activeElement as HTMLElement;

		fireEvent.keyDown(target, { key: "w", metaKey: true });
		fireEvent.keyDown(target, { key: "t", metaKey: true, shiftKey: true });
		fireEvent.keyDown(target, { key: "Tab", ctrlKey: true });

		expect(keys.closeActiveTab).not.toHaveBeenCalled();
		expect(keys.reopenClosedTab).not.toHaveBeenCalled();
		expect(keys.cycleTab).not.toHaveBeenCalled();
		screen.remove();
	});

	test("the same chords still act when focus is outside the terminal", () => {
		const keys = keybindings();

		fireEvent.keyDown(document.body, { key: "w", metaKey: true });
		expect(keys.closeActiveTab).toHaveBeenCalledTimes(1);

		fireEvent.keyDown(document.body, { key: "Tab", ctrlKey: true });
		expect(keys.cycleTab).toHaveBeenLastCalledWith(1);
	});
});
