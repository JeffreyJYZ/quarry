import { describe, expect, test } from "bun:test";
import { distanceFromBottom, sticksToBottom } from "@/lib/run/stick";

describe("sticksToBottom", () => {
	test("a viewport at the bottom follows the next line", () => {
		expect(sticksToBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 600 })).toBe(
			true,
		);
	});

	test("a viewport scrolled away from the bottom does not", () => {
		expect(sticksToBottom({ scrollHeight: 1000, scrollTop: 200, clientHeight: 600 })).toBe(
			false,
		);
	});

	test("a resize under the same scroll position recomputes the answer", () => {
		const before = { scrollHeight: 1000, scrollTop: 400, clientHeight: 600 };
		expect(sticksToBottom(before)).toBe(true);

		// The pane shrank: the same scroll offsets are now 300px from the newest row.
		const after = { ...before, clientHeight: 300 };
		expect(distanceFromBottom(after)).toBe(300);
		expect(sticksToBottom(after)).toBe(false);
	});

	test("the threshold is a distance, not an exact match", () => {
		expect(sticksToBottom({ scrollHeight: 1000, scrollTop: 377, clientHeight: 600 })).toBe(
			true,
		);
		expect(sticksToBottom({ scrollHeight: 1000, scrollTop: 376, clientHeight: 600 })).toBe(
			false,
		);
	});
});
