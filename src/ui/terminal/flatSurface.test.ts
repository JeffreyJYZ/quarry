import "@/test/dom";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XTERM_THEME } from "@/lib/consts/themes";
import { xtermTheme } from "@/ui/terminal/xtermTheme";

const ROOT = join(import.meta.dir, "../../..");
const CHROME = readFileSync(join(ROOT, "src/ui/terminal/terminal.css"), "utf8");
const SURFACE = readFileSync(join(ROOT, "src/ui/terminal/xterm.css"), "utf8");

/** The rule that contains a selector; a comma-separated selector list shares one body. */
function ruleBody(source: string, selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const at = source.search(new RegExp(escaped));
	const open = at === -1 ? -1 : source.indexOf("{", at);
	const close = open === -1 ? -1 : source.indexOf("}", open);
	return open === -1 || close === -1 ? "" : source.slice(open + 1, close);
}

/**
 * The lighter ring came from two surfaces: the frame read `--panel` while the xterm body read
 * `--bg`, and a border closed the outline. An emulator layer on a third colour would bring it back.
 */
describe("flat terminal surface", () => {
	test("no terminal stylesheet paints a background on --bg", () => {
		for (const source of [CHROME, SURFACE]) {
			expect(source).not.toMatch(/background(?:-color)?:\s*var\(--bg\)/);
		}
	});

	test("the header and status row draw no seam against the body", () => {
		expect(ruleBody(CHROME, ".terminal-chrome")).not.toMatch(/border-/);
		expect(ruleBody(CHROME, ".terminal-status")).not.toMatch(/border-/);
	});

	test("the emulator layers and the side-docked variant use the pane token", () => {
		expect(ruleBody(SURFACE, ".terminal-surface")).toContain("var(--panel)");
		expect(ruleBody(SURFACE, ".terminal .terminal-xterm")).toContain("var(--panel)");
		expect(ruleBody(SURFACE, ".terminal .terminal-xterm .xterm .xterm-screen")).toContain(
			"var(--panel)",
		);
		expect(ruleBody(SURFACE, ".terminal .terminal-xterm .xterm .xterm-viewport")).toContain(
			"var(--panel)",
		);
		expect(ruleBody(CHROME, ".terminal.terminal-side")).toContain("var(--panel)");
	});

	test("the emulator paints the pane token, not its own palette background", () => {
		const panel = "#123456";
		document.documentElement.style.setProperty("--panel", panel);
		const theme = xtermTheme();
		expect(theme.background).toBe(panel);
		expect(theme.foreground).toBe(XTERM_THEME.foreground);
	});
});
