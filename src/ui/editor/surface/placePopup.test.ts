import { describe, test, expect } from "bun:test";
import { placePopup } from "./placePopup";

describe("placePopup", () => {
	test("room below", () => {
		const p = placePopup(
			{ left: 10, top: 10, bottom: 20 },
			{ width: 50, height: 30 },
			{ width: 200, height: 200 },
		);
		expect(p).toEqual({ top: 24, left: 10 });
	});
	test("no room below, room above", () => {
		const p = placePopup(
			{ left: 10, top: 20, bottom: 190 },
			{ width: 50, height: 30 },
			{ width: 200, height: 200 },
		);
		expect(p).toEqual({ bottom: 200 - 20 + 4, left: 10 });
	});
	test("both tight", () => {
		const p = placePopup(
			{ left: 10, top: 3, bottom: 195 },
			{ width: 50, height: 30 },
			{ width: 200, height: 200 },
		);
		expect(p).toEqual({ top: 199, left: 10 });
	});
	test("right-edge flip", () => {
		const p = placePopup(
			{ left: 180, top: 10, bottom: 20 },
			{ width: 50, height: 30 },
			{ width: 200, height: 200 },
		);
		expect(p.left).toBe(130);
	});
	test("left-edge clamp", () => {
		const p = placePopup(
			{ left: 0, top: 10, bottom: 20 },
			{ width: 50, height: 30 },
			{ width: 200, height: 200 },
		);
		expect(p.left).toBe(8);
	});
	test("viewport narrower than popup", () => {
		const p = placePopup(
			{ left: 10, top: 10, bottom: 20 },
			{ width: 250, height: 30 },
			{ width: 200, height: 200 },
		);
		expect(p.left).toBe(8);
	});
});
