import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import AppErrorBoundary, { describe as describeFailure } from "@/ui/app/AppErrorBoundary";
import CrashPanel from "@/ui/app/CrashPanel";

describe("describeFailure", () => {
	test("an Error keeps its name, so a TypeError does not read as a plain bug", () => {
		expect(describeFailure(new TypeError("x is not a function"))).toBe(
			"TypeError: x is not a function",
		);
	});

	test("a thrown string survives as itself", () => {
		expect(describeFailure("boom")).toBe("boom");
	});

	test("a thrown object is serialised rather than dropped", () => {
		expect(describeFailure({ code: 7 })).toBe('{"code":7}');
	});

	test("a circular object does not throw inside the error path", () => {
		const loop: Record<string, unknown> = {};
		loop.self = loop;
		expect(describeFailure(loop)).toBe("[object Object]");
	});
});

describe("AppErrorBoundary", () => {
	test("a render error becomes a failure rather than unmounting the window", () => {
		const state = AppErrorBoundary.getDerivedStateFromError(
			new ReferenceError("Can't find variable: x"),
		);
		expect(state.failure?.message).toBe("ReferenceError: Can't find variable: x");
	});

	test("children pass through while nothing has failed", () => {
		const boundary = new AppErrorBoundary({ children: <span>shell</span> });
		const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
		expect(html).toContain("<span>shell</span>");
	});
});

describe("CrashPanel", () => {
	test("names the error, offers the reload, and says what it costs", () => {
		const html = renderToStaticMarkup(
			CrashPanel({ message: "TypeError: nope", stack: "at App" }),
		);
		expect(html).toContain("TypeError: nope");
		expect(html).toContain("Reload the window");
		expect(html).toContain("reopens the last project");
	});

	test("a failure with no stack still explains itself", () => {
		const html = renderToStaticMarkup(CrashPanel({ message: "boom" }));
		expect(html).toContain("No stack was reported.");
	});
});
