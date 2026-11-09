import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "./docs-deps";

const roots: string[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "docs-deps-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) {
		const full = join(root, path);
		await mkdir(dirname(full), { recursive: true });
		await Bun.write(full, text);
	}
	return root;
}

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const MANIFEST = JSON.stringify({ dependencies: { react: "^19" } }, null, "\t");

describe("docs-deps", () => {
	test("a misspelled @/ import fails with its file and specifier named", async () => {
		const root = await fixture({
			"website/package.json": MANIFEST,
			"website/src/page.ts": 'import { a } from "@/lib/missing-theme";\n',
			"src/lib/theme.ts": "export const a = 1;\n",
		});

		const outcome = await run(root);
		const report = outcome.lines.join("\n");
		expect(outcome.code).toBe(1);
		expect(report).toContain("website/src/page.ts");
		expect(report).toContain("@/lib/missing-theme");
	});

	test("every unresolved local specifier is recorded, not just the first", async () => {
		const root = await fixture({
			"website/package.json": MANIFEST,
			"website/src/page.ts": [
				'import { a } from "./nope";',
				'import { b } from "~/components/Nope";',
				'import { c } from "@/lib/nope";',
				"",
			].join("\n"),
		});

		const outcome = await run(root);
		const report = outcome.lines.join("\n");
		expect(outcome.code).toBe(1);
		for (const specifier of ["./nope", "~/components/Nope", "@/lib/nope"]) {
			expect(report).toContain(specifier);
		}
		expect(report).toContain("website/src/page.ts");
	});

	test("a valid graph passes, including relative, aliased, stylesheet and builtin imports", async () => {
		const root = await fixture({
			"website/package.json": MANIFEST,
			"website/src/page.ts": [
				'import Btn from "~/components/Btn";',
				'import { theme } from "@/lib/theme";',
				'import { sibling } from "./sibling";',
				'import "@/ui/styles.css";',
				'import { useState } from "react";',
				'import { join } from "node:path";',
				"",
			].join("\n"),
			"website/src/components/Btn.tsx": "export default function Btn() {}\n",
			"website/src/sibling.ts": "export const sibling = 1;\n",
			"src/lib/theme.ts": "export const theme = 1;\n",
			"src/ui/styles.css": ":root {}\n",
		});

		const outcome = await run(root);
		expect(outcome.lines).toEqual([]);
		expect(outcome.code).toBe(0);
	});

	test("a bare package missing from website/package.json still fails", async () => {
		const root = await fixture({
			"website/package.json": MANIFEST,
			"website/src/page.ts": 'import pad from "left-pad";\n',
			"src/lib/theme.ts": "export const theme = 1;\n",
		});

		const outcome = await run(root);
		const report = outcome.lines.join("\n");
		expect(outcome.code).toBe(1);
		expect(report).toContain("website/src/page.ts");
		expect(report).toContain("left-pad");
	});
});
