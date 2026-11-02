import { describe, expect, test } from "bun:test";
import { launchFailureLines, type LaunchFailure } from "@/lib/run/failureLines";

function diagnostic(path: string, line: number, column: number, message: string) {
	return {
		path,
		range: {
			start: { line, character: column },
			end: { line, character: column + 1 },
		},
		severity: 1 as const,
		message,
		source: "clang",
	};
}

const failure: LaunchFailure = {
	stage: "build",
	message: "error: could not compile",
	diagnostics: [
		diagnostic("/p/src/main.c", 9, 4, "use of undeclared identifier 'foo'"),
		diagnostic("/p/src/main.c", 2, 0, "expected ';'"),
	],
};

describe("launchFailureLines", () => {
	test("puts the summary on the first line", () => {
		expect(launchFailureLines(failure, "/p")[0]).toBe("build failed: error: could not compile");
	});

	test("lists diagnostics in file order, 1-based, relative to the project", () => {
		expect(launchFailureLines(failure, "/p").slice(1)).toEqual([
			"src/main.c:3:1: error: expected ';'",
			"src/main.c:10:5: error: use of undeclared identifier 'foo'",
		]);
	});

	test("keeps a path outside the project whole", () => {
		const outside: LaunchFailure = {
			stage: "build",
			message: "",
			diagnostics: [diagnostic("/elsewhere/x.c", 0, 0, "boom")],
		};
		expect(launchFailureLines(outside, "/p")[1]).toBe("/elsewhere/x.c:1:1: error: boom");
	});

	test("never claims something a stage did not say", () => {
		const resolve: LaunchFailure = {
			stage: "resolve",
			message: "no such target",
			diagnostics: [],
		};
		expect(launchFailureLines(resolve, "/p")).toEqual(["resolve failed: no such target"]);
	});

	test("a failed build with no findings still says so", () => {
		const empty: LaunchFailure = {
			stage: "build",
			message: "make: *** [all] Error 1",
			diagnostics: [],
		};
		expect(launchFailureLines(empty, null)).toEqual([
			"build failed: make: *** [all] Error 1",
			"the build reported no diagnostics, so only its summary is above",
		]);
	});
});
