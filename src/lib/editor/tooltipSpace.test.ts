import { describe, expect, test } from "bun:test";
import { tooltipSpace } from "@/lib/editor/tooltipSpace";

const window = { left: 0, top: 0, right: 900, bottom: 700 };
const pane = { left: 240, top: 40, right: 900, bottom: 520 };

describe("tooltipSpace", () => {
	test("a pane inside the window is the whole space", () => {
		expect(tooltipSpace(pane, window)).toEqual(pane);
	});
	test("a pane running past the window is clipped to it", () => {
		expect(tooltipSpace({ ...pane, right: 1200, bottom: 900 }, window)).toEqual({
			...pane,
			right: 900,
			bottom: 700,
		});
	});
	test("a pane shorter than a popup falls back to the window", () => {
		expect(tooltipSpace({ ...pane, bottom: 140 }, window)).toEqual(window);
	});
});
