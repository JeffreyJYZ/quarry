import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { useStableCallback } from "@/lib/react/useStableCallback";

afterEach(() => {
	cleanup();
});

describe("useStableCallback", () => {
	test("keeps one identity across a re-render and runs the newest closure", () => {
		const first = mock((_value: number) => {});
		const second = mock((_value: number) => {});
		const { result, rerender } = renderHook(({ callback }) => useStableCallback(callback), {
			initialProps: { callback: first },
		});

		const stable = result.current;
		rerender({ callback: second });

		expect(result.current).toBe(stable);
		result.current(3);
		expect(second).toHaveBeenCalledWith(3);
		expect(first).not.toHaveBeenCalled();
	});
});
