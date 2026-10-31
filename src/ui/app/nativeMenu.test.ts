import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildCommands, type CommandContext } from "@/ui/app/commands";

const REPO_ROOT = join(import.meta.dir, "../../..");
const RUST_MENU = "src-tauri/src/menu/mod.rs";
const SHELL_GLUE = "src/ui/app/useShellGlue.ts";

const noop = () => {};

/** The shell's no-op context: nothing open, nothing running, every action a stub. */
const IDLE_CONTEXT: CommandContext = {
	root: null,
	activePath: null,
	cursor: null,
	building: false,
	formatting: false,
	running: null,
	debugging: false,
	panelExpanded: false,
	openProject: noop,
	build: noop,
	run: noop,
	debug: noop,
	stop: noop,
	save: noop,
	saveAll: noop,
	format: noop,
	runToCursor: noop,
	showDebugger: noop,
	showDisassembly: noop,
	toggleGit: noop,
	openSearch: noop,
	toggleRail: noop,
	toggleDock: noop,
	toggleTerminal: noop,
	revealFile: noop,
	openQuick: noop,
	openShortcuts: noop,
	refreshGit: noop,
	toggleBlame: noop,
	newProject: noop,
	checkUpdates: noop,
	workspaceSymbol: noop,
	gotoImplementation: noop,
	gotoTypeDefinition: noop,
	quickDoc: noop,
};

/** Read a repo file, failing the test with its name instead of an opaque fs error. */
function readSource(relativePath: string): string {
	try {
		return readFileSync(join(REPO_ROOT, relativePath), "utf8");
	} catch (error) {
		throw new Error(`native menu test cannot read ${relativePath}: ${String(error)}`);
	}
}

/** Ids the native menu emits, i.e. every literal passed to `MenuItemBuilder::with_id`. */
function extractMenuIds(source: string): string[] {
	return [...source.matchAll(/MenuItemBuilder::with_id\(\s*"([^"]+)"/g)].map((match) => match[1]);
}

/** Ids the shell dispatches itself, i.e. every `id === "..."` comparison in the glue. */
function extractShellIds(source: string): string[] {
	return [...source.matchAll(/id\s*===\s*"([^"]+)"/g)].map((match) => match[1]);
}

describe("native menu contract", () => {
	test("the extraction itself reads both files", () => {
		// Guard the regexes: an empty set would make the coverage check pass for free.
		const menuIds = extractMenuIds(readSource(RUST_MENU));
		const shellIds = extractShellIds(readSource(SHELL_GLUE));
		expect(menuIds.length).toBeGreaterThan(0);
		expect(shellIds.length).toBeGreaterThan(0);
		expect(menuIds.filter((id, index) => menuIds.indexOf(id) !== index)).toEqual([]);
	});

	test("every native menu id is runnable, as a command or by the shell", () => {
		const commandIds = new Set(buildCommands(IDLE_CONTEXT).map((command) => command.id));
		// `open-settings` is not a palette command: the shell's own dispatch opens the settings pane.
		const shellIds = new Set(extractShellIds(readSource(SHELL_GLUE)));
		const dead = extractMenuIds(readSource(RUST_MENU)).filter(
			(id) => !commandIds.has(id) && !shellIds.has(id),
		);
		expect(dead).toEqual([]);
	});

	test("the shell's own ids are ones the native menu actually sends", () => {
		// A shell-only id nobody emits is a handler for an event that never arrives.
		const menuIds = new Set(extractMenuIds(readSource(RUST_MENU)));
		expect(extractShellIds(readSource(SHELL_GLUE)).filter((id) => !menuIds.has(id))).toEqual(
			[],
		);
	});
});
