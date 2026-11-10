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
	nextBookmark: noop,
	previousBookmark: noop,
	bookmarkCount: 0,
	runToCursor: noop,
	showDebugger: noop,
	showTodos: noop,
	showDisassembly: noop,
	toggleGit: noop,
	openSearch: noop,
	toggleRail: noop,
	toggleDock: noop,
	toggleTerminal: noop,
	toggleSplit: noop,
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
	restartLsp: noop,
	openNotes: noop,
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

describe("split editor", () => {
	test("is a palette row that toggles the pane", () => {
		let toggled = 0;
		const command = buildCommands({
			...IDLE_CONTEXT,
			root: "/p",
			toggleSplit: () => {
				toggled += 1;
			},
		}).find((entry) => entry.id === "toggle-split");
		expect(command?.label).toBe("Split editor right");
		expect(command?.hint).toBe("Cmd+`");
		expect(command?.disabled).toBe(false);
		command?.run();
		expect(toggled).toBe(1);
	});

	test("is unavailable with no project open", () => {
		const command = buildCommands(IDLE_CONTEXT).find((entry) => entry.id === "toggle-split");
		expect(command?.disabled).toBe(true);
	});
});

describe("bookmark steps", () => {
	test("are palette rows that walk the list both ways", () => {
		const seen: string[] = [];
		const commands = buildCommands({
			...IDLE_CONTEXT,
			root: "/p",
			bookmarkCount: 3,
			nextBookmark: () => seen.push("next"),
			previousBookmark: () => seen.push("previous"),
		});
		const next = commands.find((entry) => entry.id === "next-bookmark");
		const previous = commands.find((entry) => entry.id === "previous-bookmark");
		expect(next?.label).toBe("Next bookmark");
		expect(next?.hint).toBe("Cmd+Alt+N");
		expect(previous?.label).toBe("Previous bookmark");
		expect(previous?.hint).toBe("Cmd+Alt+P");
		expect(next?.disabled).toBe(false);
		expect(previous?.disabled).toBe(false);
		next?.run();
		previous?.run();
		expect(seen).toEqual(["next", "previous"]);
	});

	test("say why they are unavailable with no project or no bookmarks", () => {
		const noProject = buildCommands(IDLE_CONTEXT).find((entry) => entry.id === "next-bookmark");
		expect(noProject?.disabled).toBe(true);
		const none = buildCommands({
			...IDLE_CONTEXT,
			root: "/p",
			bookmarkCount: 0,
		}).find((entry) => entry.id === "previous-bookmark");
		expect(none?.disabled).toBe(true);
		expect(none?.disabledReason).toBe("No bookmarks in this project");
	});
});

describe("restart language server", () => {
	test("is a palette row that is disabled with no project", () => {
		const command = buildCommands(IDLE_CONTEXT).find((entry) => entry.id === "restart-lsp");
		expect(command?.label).toBe("Restart language server");
		expect(command?.disabled).toBe(true);
	});

	test("is enabled and runs the restart once a project is open", () => {
		let restarted = 0;
		const command = buildCommands({
			...IDLE_CONTEXT,
			root: "/p",
			restartLsp: () => {
				restarted += 1;
			},
		}).find((entry) => entry.id === "restart-lsp");
		expect(command?.disabled).toBe(false);
		command?.run();
		expect(restarted).toBe(1);
	});
});
