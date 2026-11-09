import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import SearchPalette from "@/ui/search/SearchPalette";

describe("search palette dialog focus", () => {
	afterEach(() => {
		cleanup();
	});

	test("opens with the query box focused and closes on Escape", () => {
		const onClose = mock(() => {});
		const view = render(<SearchPalette root="/p" onOpen={() => {}} onClose={onClose} />);

		const panel = view.getByRole("dialog", { name: "Project search" });
		const input = view.getByLabelText("Search query");
		expect(panel.getAttribute("aria-modal")).toBe("true");
		expect(document.activeElement).toBe(input);
		expect(panel.contains(document.activeElement)).toBe(true);

		fireEvent.keyDown(input, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
