import { describe, expect, test } from "bun:test";
import { restartCwd } from "@/ui/terminal/sessionCwd";

describe("restartCwd", () => {
	test("an absent stored cwd falls back to the root without probing", async () => {
		let probed: string | null = null;
		const cwd = await restartCwd(null, "/proj", async (path) => {
			probed = path;
			return true;
		});

		expect(cwd).toBe("/proj");
		expect(probed).toBeNull();
	});

	test("a stored cwd is probed once and kept when it still exists", async () => {
		const probed: string[] = [];
		const cwd = await restartCwd("/proj/src", "/proj", async (path) => {
			probed.push(path);
			return true;
		});

		expect(cwd).toBe("/proj/src");
		expect(probed).toEqual(["/proj/src"]);
	});

	test("a vanished stored cwd falls back to the root", async () => {
		const cwd = await restartCwd("/proj/src", "/proj", async () => false);

		expect(cwd).toBe("/proj");
	});
});
