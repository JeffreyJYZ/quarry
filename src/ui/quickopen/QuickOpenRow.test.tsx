import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { QuickOpenRow } from "@/ui/quickopen/QuickOpenRow";

afterEach(() => {
	cleanup();
});

function row(onSelect: (path: string) => void, onHover: (index: number) => void) {
	return render(
		<QuickOpenRow
			path="/p/src/main.cpp"
			root="/p"
			index={7}
			active={false}
			isOpen={false}
			onSelect={onSelect}
			onHover={onHover}
		/>,
	);
}

describe("a quick-open row", () => {
	test("is memoised, so an unchanged row is skipped by its parent's re-render", () => {
		expect((QuickOpenRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
			Symbol.for("react.memo"),
		);
	});

	test("hands its own path and index to the shared handlers", () => {
		const onSelect = mock((_path: string) => {});
		const onHover = mock((_index: number) => {});
		const view = row(onSelect, onHover);
		const button = view.getByTitle("/p/src/main.cpp");

		fireEvent.click(button);
		fireEvent.mouseEnter(button);

		expect(onSelect).toHaveBeenCalledWith("/p/src/main.cpp");
		expect(onHover).toHaveBeenCalledWith(7);
	});
});
