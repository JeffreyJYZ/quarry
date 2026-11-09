import { describe, expect, test } from "bun:test";
import { createTransportGate } from "@/lib/debug/transportGate";

describe("createTransportGate", () => {
	test("drops a second request while the first is in flight", async () => {
		const gate = createTransportGate();
		const calls: string[] = [];
		let release = () => {};
		const first = gate.run(async () => {
			calls.push("first");
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		});
		expect(calls).toEqual(["first"]);
		expect(gate.busy).toBe(true);

		await gate.run(async () => {
			calls.push("second");
		});
		expect(calls).toEqual(["first"]);

		release();
		await first;
		expect(gate.busy).toBe(false);
	});

	test("opens again once the request lands", async () => {
		const gate = createTransportGate();
		const calls: string[] = [];
		await gate.run(async () => {
			calls.push("first");
		});
		await gate.run(async () => {
			calls.push("second");
		});
		expect(calls).toEqual(["first", "second"]);
	});

	test("a rejected request still opens the gate", async () => {
		const gate = createTransportGate();
		await expect(
			gate.run(async () => {
				throw new Error("adapter said no");
			}),
		).rejects.toThrow("adapter said no");
		expect(gate.busy).toBe(false);
		let ran = false;
		await gate.run(async () => {
			ran = true;
		});
		expect(ran).toBe(true);
	});
});
