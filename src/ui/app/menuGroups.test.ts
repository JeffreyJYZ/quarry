import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildCommands, type CommandContext } from "@/ui/app/commands";
import { MENU_GROUPS, type MenuGroup, type MenuItem } from "@/ui/app/menuGroups";
import { MENU_COMMAND_IDS } from "@/ui/app/useNativeMenu";

const REPO_ROOT = join(import.meta.dir, "../../..");
const RUST_MENU = "src-tauri/src/menu/mod.rs";
const SHELL_GLUE = "src/ui/app/useShellGlue.ts";

/** The shell's own no-op context: nothing open, nothing running, every action a stub. */
const noop = () => {};
const IDLE_CONTEXT: CommandContext = {
	root: null,
	activePath: null,
	cursor: null,
	building: false,
	formatting: false,
	running: null,
	panelExpanded: false,
	openProject: noop,
	build: noop,
	run: noop,
	stop: noop,
	save: noop,
	saveAll: noop,
	format: noop,
	runToCursor: noop,
	toggleDebug: noop,
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
};

/** Read a repo file, failing the test with a name instead of an opaque fs error. */
function readSource(relativePath: string): string {
	try {
		return readFileSync(join(REPO_ROOT, relativePath), "utf8");
	} catch (error) {
		throw new Error(`menu contract test cannot read ${relativePath}: ${String(error)}`);
	}
}

/** Command ids the Rust menu emits, i.e. the literals passed to `MenuItemBuilder::with_id`. */
function extractRustMenuIds(source: string): string[] {
	return [...source.matchAll(/MenuItemBuilder::with_id\(\s*"([^"]+)"/g)].map((match) => match[1]);
}

/** Ids the shell dispatches itself, i.e. every `id === "..."` comparison in the glue. */
function extractShellHandledIds(source: string): string[] {
	return [...source.matchAll(/id\s*===\s*"([^"]+)"/g)].map((match) => match[1]);
}

function menuItems(group: MenuGroup): MenuItem[] {
	return group.items.filter((item): item is MenuItem => item !== "separator");
}

function menuItemIds(groups: MenuGroup[]): string[] {
	return groups.flatMap((group) => menuItems(group).map((item) => item.id));
}

describe("menu agreement", () => {
	test("every menu bar item is a palette command", () => {
		const commandIds = new Set(buildCommands(IDLE_CONTEXT).map((command) => command.id));
		const missing = menuItemIds(MENU_GROUPS).filter((id) => !commandIds.has(id));
		expect(missing).toEqual([]);
	});

	test("the Rust menu emits ids the native bridge accepts", () => {
		const rustIds = extractRustMenuIds(readSource(RUST_MENU));
		// Guard the regex itself: an empty set would make both diffs below pass for free.
		expect(rustIds.length).toBeGreaterThan(0);
		const emitted = new Set(rustIds);
		expect({ notInBridge: [...emitted].filter((id) => !MENU_COMMAND_IDS.has(id)) }).toEqual({
			notInBridge: [],
		});
		expect({ notInRust: [...MENU_COMMAND_IDS].filter((id) => !emitted.has(id)) }).toEqual({
			notInRust: [],
		});
	});

	test("every bridged id is runnable, either as a command or by the shell", () => {
		const commandIds = new Set(buildCommands(IDLE_CONTEXT).map((command) => command.id));
		// `open-settings` is not a palette command: the shell's dispatch opens the settings pane.
		const shellHandled = new Set(extractShellHandledIds(readSource(SHELL_GLUE)));
		expect(shellHandled.size).toBeGreaterThan(0);
		const dead = [...MENU_COMMAND_IDS].filter(
			(id) => !commandIds.has(id) && !shellHandled.has(id),
		);
		expect(dead).toEqual([]);
		// A shell-only id that nobody bridges would be a handler for an event that never arrives.
		expect([...shellHandled].filter((id) => !MENU_COMMAND_IDS.has(id))).toEqual([]);
	});

	test("groups have unique item ids and no edge separators", () => {
		const ids = menuItemIds(MENU_GROUPS);
		expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
		const edgeSeparators = MENU_GROUPS.filter(
			(group) => group.items[0] === "separator" || group.items.at(-1) === "separator",
		).map((group) => group.label);
		expect(edgeSeparators).toEqual([]);
	});
});
