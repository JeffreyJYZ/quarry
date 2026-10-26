import { describe, expect, test } from "bun:test";
import { getState, setState, subscribe, resetState } from "@/lib/updates/state";

describe("state", () => {
	test("setState notifies subscribers once", () => {
		resetState();
		let count = 0;
		const unsub = subscribe(() => {
			count += 1;
		});
		setState({ phase: "checking", offer: null, message: null, progress: null });
		expect(count).toBe(1);
		expect(getState().phase).toBe("checking");
		unsub();
	});

	test("unsubscribing stops delivery", () => {
		resetState();
		let count = 0;
		const unsub = subscribe(() => {
			count += 1;
		});
		unsub();
		setState({ phase: "idle", offer: null, message: null, progress: null });
		expect(count).toBe(0);
	});
});
