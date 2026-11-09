import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { emptySession } from "@/lib/terminal/sessions";
import TerminalHeader from "@/ui/terminal/TerminalHeader";

function header(onSelect: (id: number) => void, onClose: (id: number) => void = () => {}) {
	const one = emptySession(1, "/p/one");
	const two = emptySession(2, "/p/two");
	const view = render(
		<TerminalHeader
			sessions={[one, two]}
			active={one}
			activeId={1}
			onSelect={onSelect}
			onOpen={() => {}}
			onClose={onClose}
			onRestart={() => {}}
			updateSession={() => {}}
		/>,
	);
	return view;
}

afterEach(() => {
	cleanup();
});

describe("the terminal tab strip", () => {
	test("Enter and Space activate the focused tab", () => {
		const onSelect = mock((_id: number) => {});
		const view = header(onSelect);
		const first = view.getAllByRole("tab")[0] as HTMLElement;

		fireEvent.keyDown(first, { key: "Enter" });
		expect(onSelect).toHaveBeenLastCalledWith(1);

		fireEvent.keyDown(first, { key: " " });
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	test("arrows step and Home and End jump", () => {
		const onSelect = mock((_id: number) => {});
		const view = header(onSelect);
		const tabs = view.getAllByRole("tab");

		fireEvent.keyDown(tabs[0] as HTMLElement, { key: "ArrowRight" });
		expect(onSelect).toHaveBeenLastCalledWith(2);

		fireEvent.keyDown(tabs[1] as HTMLElement, { key: "Home" });
		expect(onSelect).toHaveBeenLastCalledWith(1);

		fireEvent.keyDown(tabs[1] as HTMLElement, { key: "End" });
		expect(onSelect).toHaveBeenLastCalledWith(2);
	});

	test("Enter on the close button belongs to the close button", () => {
		const onSelect = mock((_id: number) => {});
		const onClose = mock((_id: number) => {});
		const view = header(onSelect, onClose);
		const close = view
			.getAllByRole("tab")[0]
			?.querySelector<HTMLElement>(".terminal-tab-close");

		fireEvent.keyDown(close as HTMLElement, { key: "Enter" });

		expect(onSelect).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});
});
