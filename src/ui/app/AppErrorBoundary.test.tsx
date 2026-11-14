import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppErrorBoundary, {
	describe as describeFailure,
	failureState,
} from "@/ui/app/AppErrorBoundary";
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

describe("a nested boundary", () => {
	// The failure this pins: the only boundary wrapped the whole app, so one panel throwing replaced
	// the window — chrome, tabs and all — with the crash panel. A region boundary must say so and keep
	// the rest of the shell alive.
	function crashed(region?: string): string {
		const boundary = new AppErrorBoundary({ children: null, region });
		boundary.state = { failure: { message: "TypeError: boom" }, logPath: null };
		return renderToStaticMarkup(boundary.render() as ReactElement);
	}

	test("names the region it replaced, not the window", () => {
		const html = crashed("the workspace");
		expect(html).toContain("quarry stopped drawing the workspace");
		expect(html).not.toContain("this window");
	});

	test("the root boundary still says the window", () => {
		expect(crashed()).toContain("quarry stopped drawing this window");
	});
});

describe("a failure reaches the crash log without costing the error", () => {
	test("the caught error is what the panel shows, before any log answer", () => {
		const next = failureState(new RangeError("Position 61 is out of range"), {
			componentStack: "\n    at Editor",
		});
		expect(next.failure?.message).toBe("RangeError: Position 61 is out of range");
		expect(next.failure?.stack).toContain("at Editor");
		expect(next.logPath).toBeNull();
	});
});

describe("CrashPanel names the log file", () => {
	test("prints the path once it is known", () => {
		const html = renderToStaticMarkup(
			CrashPanel({
				message: "TypeError: nope",
				logPath: "/Users/me/Library/Logs/quarry/quarry.log",
			}),
		);
		expect(html).toContain(
			"was written to <code>/Users/me/Library/Logs/quarry/quarry.log</code>",
		);
	});

	test("says the error was logged even before the path arrives", () => {
		const html = renderToStaticMarkup(CrashPanel({ message: "TypeError: nope" }));
		expect(html).toContain("written to the crash log");
	});
});
