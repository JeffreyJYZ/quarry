import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STYLES = "src/ui/styles";

/** A colour written by hand instead of read from the theme. */
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b/;

/**
 * Token definitions live in `1-root.css`; everything else reads them.
 *
 * A component stylesheet that writes `background: #1e1e1e` keeps that colour under every theme, so
 * the rename bar stayed near-black on a light canvas and the scrollbar thumb stayed dark. This scan
 * only tolerates a hex inside a `var(--token, #fallback)`, which is a fallback, not a decision.
 */
function handwrittenColours(source: string): string[] {
	return source
		.split("\n")
		.map((line, index) => ({ line, number: index + 1 }))
		.filter(({ line }) => RAW_COLOUR.test(line.replace(/var\([^)]*\)/g, "")))
		.map(({ line, number }) => `${number}: ${line.trim()}`);
}

describe("component stylesheets", () => {
	const files = readdirSync(STYLES)
		.filter((name) => name.endsWith(".css") && name !== "1-root.css")
		.sort();

	test("there is more than one stylesheet to scan", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	test("no colour is hardcoded outside the token file", () => {
		const offenders = files.flatMap((name) => {
			const found = handwrittenColours(readFileSync(join(STYLES, name), "utf8"));
			return found.map((entry) => `${name}:${entry}`);
		});
		expect(offenders).toEqual([]);
	});

	test("a var() fallback is not counted as a hardcoded colour", () => {
		expect(handwrittenColours("a { color: var(--muted, #888); }")).toEqual([]);
		expect(handwrittenColours("a { color: #888; }")).toHaveLength(1);
	});
});
