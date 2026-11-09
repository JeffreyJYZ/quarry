import { beforeEach, describe, expect, test } from "bun:test";
import type { BuildReport } from "@/lib/project/api";
import { buildOnce, resetBuildGate } from "@/lib/project/buildOnce";

function report(summary: string): BuildReport {
	return { success: true, diagnostics: [], durationMs: 1, summary, artifact: null };
}

describe("buildOnce", () => {
	beforeEach(resetBuildGate);

	test("two concurrent launches build once", async () => {
		let calls = 0;
		let release: (value: BuildReport) => void = () => {};
		const build = () => {
			calls += 1;
			return new Promise<BuildReport>((resolve) => {
				release = resolve;
			});
		};

		const first = buildOnce("/projects/demo", "debug", build);
		const second = buildOnce("/projects/demo", "debug", build);
		release(report("ok"));

		const [a, b] = await Promise.all([first, second]);
		expect(calls).toBe(1);
		expect(a).toBe(b);
		expect(a.summary).toBe("ok");
	});

	test("a later build starts once the running one settles", async () => {
		let calls = 0;
		const build = async () => {
			calls += 1;
			return report("ok");
		};

		await buildOnce("/projects/demo", "debug", build);
		await buildOnce("/projects/demo", "debug", build);

		expect(calls).toBe(2);
	});

	test("a different tree or profile is a different build", async () => {
		let calls = 0;
		const build = async () => {
			calls += 1;
			return report("ok");
		};

		await Promise.all([
			buildOnce("/projects/demo", "debug", build),
			buildOnce("/projects/demo", "release", build),
			buildOnce("/projects/other", "debug", build),
		]);

		expect(calls).toBe(3);
	});
});
