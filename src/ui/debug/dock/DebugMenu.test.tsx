import "@/test/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DebugController } from "@/lib/debug/session";
import DebugMenu from "@/ui/debug/dock/DebugMenu";

const debug = {
	status: "idle",
	sessionId: null,
	presetEntries: [],
	preset: "",
	setPreset: () => {},
	resolved: null,
	configError: null,
	exceptionFilters: [],
	exceptionChecked: new Set<string>(),
} as unknown as DebugController;

describe("debug menu dialog focus", () => {
	afterEach(() => {
		cleanup();
	});

	test("opens with focus inside the menu and closes on Escape", () => {
		const view = render(<DebugMenu debug={debug} />);
		const trigger = view.getByRole("button", { name: "Debugger options" });
		trigger.focus();
		fireEvent.click(trigger);

		const panel = view.getByRole("dialog", { name: "Debugger options" });
		expect(panel.getAttribute("aria-modal")).toBe("true");
		expect(panel.contains(document.activeElement)).toBe(true);

		fireEvent.keyDown(panel, { key: "Escape" });
		expect(view.queryByRole("dialog")).toBeNull();
	});
});
