import { describe, expect, test } from "bun:test";
import { logUiError } from "@/lib/log/api";

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
