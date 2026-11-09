import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import ShortcutSheet from "@/ui/shortcuts/ShortcutSheet";

describe("shortcut sheet dialog focus", () => {
	afterEach(() => {
		cleanup();
	});

	test("opens with focus inside the sheet and closes on Escape", () => {
		const onClose = mock(() => {});
		const view = render(<ShortcutSheet groups={[]} onClose={onClose} />);

		const panel = view.getByRole("dialog", { name: "Keyboard shortcuts" });
		expect(panel.getAttribute("aria-modal")).toBe("true");
		expect(panel.contains(document.activeElement)).toBe(true);

		fireEvent.keyDown(panel, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
