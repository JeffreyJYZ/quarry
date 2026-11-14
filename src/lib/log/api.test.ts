import { describe, expect, test } from "bun:test";
import { describe as describeThrown, failureFromThrown, logUiError } from "@/lib/log/api";

describe("describe", () => {
	test("an Error keeps its name, so a TypeError does not read as a plain bug", () => {
		expect(describeThrown(new TypeError("x is not a function"))).toBe(
			"TypeError: x is not a function",
		);
	});

	test("a thrown string survives as itself", () => {
		expect(describeThrown("boom")).toBe("boom");
	});

	test("a thrown object is serialised rather than dropped", () => {
		expect(describeThrown({ code: 7 })).toBe('{"code":7}');
	});

	test("a circular object does not throw inside the error path", () => {
		const loop: Record<string, unknown> = {};
		loop.self = loop;
		expect(describeThrown(loop)).toBe("[object Object]");
	});
});

describe("failureFromThrown", () => {
	test("keeps the name, message and stack a RangeError carries", () => {
		const failure = failureFromThrown(
			new RangeError("Position 61 is out of range for changeset of length 52"),
		);
		expect(failure.name).toBe("RangeError");
		expect(failure.message).toBe("Position 61 is out of range for changeset of length 52");
		expect(failure.stack).toContain("RangeError");
	});

	test("a non-Error throw is named Thrown and keeps its described text", () => {
		expect(failureFromThrown("boom")).toEqual({ name: "Thrown", message: "boom" });
		expect(failureFromThrown({ code: 7 })).toEqual({
			name: "Thrown",
			message: '{"code":7}',
		});
	});
});

describe("logUiError", () => {
	test("hands the Rust command every part of the failure, region included", async () => {
		const sent: unknown[] = [];
		const path = await logUiError(
			{
				name: "TypeError",
				message: "x is not a function",
				stack: "at App",
				componentStack: "in App",
				region: "the workspace",
				source: "boundary",
				documentLength: 52,
			},
			async (failure) => {
				sent.push(failure);
				return "/Users/me/Library/Logs/quarry/quarry.log";
			},
		);

		expect(sent).toEqual([
			{
				name: "TypeError",
				message: "x is not a function",
				stack: "at App",
				componentStack: "in App",
				region: "the workspace",
				source: "boundary",
				documentLength: 52,
			},
		]);
		expect(path).toBe("/Users/me/Library/Logs/quarry/quarry.log");
	});

	test("a command that fails answers null instead of throwing", async () => {
		const path = await logUiError({ name: "Error", message: "boom" }, async () => {
			throw new Error("no such command");
		});
		expect(path).toBeNull();
	});
});
