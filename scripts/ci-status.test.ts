import { describe, expect, test } from "bun:test";
import { ciVerdict } from "./ci-status";

const SHA = "abc123";

describe("ciVerdict", () => {
	test("success proceeds", () => {
		const verdict = ciVerdict(SHA, {
			status: "completed",
			conclusion: "success",
			url: "https://example.com/run/1",
			databaseId: 1,
		});
		expect(verdict.proceed).toBe(true);
		if (verdict.proceed) expect(verdict.message).toBe(`CI green for ${SHA}`);
	});

	test("running proceeds with notice", () => {
		const verdict = ciVerdict(SHA, {
			status: "in_progress",
			conclusion: null,
			url: "https://example.com/run/2",
			databaseId: 2,
		});
		expect(verdict.proceed).toBe(true);
		if (verdict.proceed)
			expect(verdict.message).toBe(`CI running for ${SHA} — proceeding on the local gate`);
	});

	test("queued proceeds with notice", () => {
		const verdict = ciVerdict(SHA, {
			status: "queued",
			conclusion: null,
			url: "https://example.com/run/3",
			databaseId: 3,
		});
		expect(verdict.proceed).toBe(true);
		if (verdict.proceed)
			expect(verdict.message).toBe(`CI queued for ${SHA} — proceeding on the local gate`);
	});

	test("failure refuses", () => {
		const verdict = ciVerdict(
			SHA,
			{
				status: "completed",
				conclusion: "failure",
				url: "https://example.com/run/4",
				databaseId: 4,
			},
			["gate", "build"],
		);
		expect(verdict.proceed).toBe(false);
		if (!verdict.proceed) {
			expect(verdict.message).toBe(`CI failed for ${SHA}: https://example.com/run/4`);
			expect(verdict.failingJobs).toEqual(["gate", "build"]);
		}
	});

	test("cancelled refuses", () => {
		const verdict = ciVerdict(SHA, {
			status: "completed",
			conclusion: "cancelled",
			url: "https://example.com/run/5",
			databaseId: 5,
		});
		expect(verdict.proceed).toBe(false);
		if (!verdict.proceed)
			expect(verdict.message).toBe(`CI cancelled for ${SHA}: https://example.com/run/5`);
	});

	test("no run proceeds with notice", () => {
		const verdict = ciVerdict(SHA, null);
		expect(verdict.proceed).toBe(true);
		if (verdict.proceed)
			expect(verdict.message).toBe(`CI absent for ${SHA} — proceeding on the local gate`);
	});
});
