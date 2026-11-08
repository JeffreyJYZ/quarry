import { describe, expect, test } from "bun:test";
import { isMissingSessionError } from "@/lib/lsp/errors";

describe("isMissingSessionError", () => {
	test("the error a restart produces is not worth reporting", () => {
		expect(
			isMissingSessionError(
				new Error(
					"no language server session for clangd::/Users/jyz/dev/robotics/class/2026-11-5",
				),
			),
		).toBe(true);
	});

	test("a real failure is still reported", () => {
		expect(isMissingSessionError(new Error("clangd exited with status 1"))).toBe(false);
	});

	test("a non-error value does not throw and is not swallowed", () => {
		expect(isMissingSessionError("something else")).toBe(false);
	});
});
