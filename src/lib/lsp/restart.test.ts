import { describe, expect, test } from "bun:test";
import { NO_RESTART_IN_FLIGHT, restartSettled } from "@/lib/lsp/restart";

describe("restartSettled", () => {
	test("no restart has happened, so there is nothing to clear", () => {
		expect(restartSettled(0, NO_RESTART_IN_FLIGHT, 1)).toBe(false);
	});

	// The render that bumps the token still holds the previous sessions as running.
	test("the old servers running do not end a restart that has not stopped them yet", () => {
		expect(restartSettled(1, NO_RESTART_IN_FLIGHT, 1)).toBe(false);
	});

	test("a restart still waiting on its server is not settled", () => {
		expect(restartSettled(1, 1, 0)).toBe(false);
	});

	test("a server answering after the teardown settles it", () => {
		expect(restartSettled(1, 1, 1)).toBe(true);
	});

	test("an earlier restart's teardown does not settle a later one", () => {
		expect(restartSettled(2, 1, 1)).toBe(false);
	});
});
