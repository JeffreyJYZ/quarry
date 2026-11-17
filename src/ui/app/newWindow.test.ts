import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { SHORTCUT_GROUPS } from "@/lib/consts/app";
import { buildCommands, type CommandContext } from "@/ui/app/commands";

const REPO_ROOT = join(import.meta.dir, "../../..");
const SHELL_COMMANDS = "src/ui/app/shellCommands.ts";

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
	openStructure: noop,
	openShortcuts: noop,
	workspaceSymbol: noop,
	gotoImplementation: noop,
	gotoTypeDefinition: noop,
	quickDoc: noop,
	refreshGit: noop,
	restartLsp: noop,
	openNotes: noop,
	toggleBlame: noop,
	newProject: noop,
	newWindow: noop,
	checkUpdates: noop,
};

describe("new window palette row", () => {
	test("exists with its label and chord", () => {
		const command = buildCommands(IDLE_CONTEXT).find((entry) => entry.id === "new-window");
		expect(command?.label).toBe("New window");
		expect(command?.hint).toBe("Cmd+Shift+N");
	});

	test("is enabled with no project open", () => {
		const command = buildCommands(IDLE_CONTEXT).find((entry) => entry.id === "new-window");
		// The shell's blanket "Open a project first" pass must not reach this row.
		expect(command?.disabled).not.toBe(true);
		expect(command?.disabledReason).toBeUndefined();
	});

	test("runs the shell's newWindow action", () => {
		let opened = 0;
		const command = buildCommands({
			...IDLE_CONTEXT,
			newWindow: () => {
				opened += 1;
			},
		}).find((entry) => entry.id === "new-window");
		command?.run();
		expect(opened).toBe(1);
	});
});

describe("new window shell wiring", () => {
	test("the palette row is built from the api wrapper, not a second implementation", () => {
		let source: string;
		try {
			source = readFileSync(join(REPO_ROOT, SHELL_COMMANDS), "utf8");
		} catch (error) {
			throw new Error(`new window test cannot read ${SHELL_COMMANDS}: ${String(error)}`);
		}
		// The glue imports the wrapper and hands it to the row; a stub here would be the defect.
		expect(source).toMatch(/import\s*\{[^}]*newWindow[^}]*\}\s*from\s*"@\/lib\/project\/api"/);
		expect(source).toMatch(/newWindow:\s*\(\)\s*=>/);
	});
});

describe("new window shortcut row", () => {
	const entries = SHORTCUT_GROUPS.flatMap((group) => group.entries);

	test("is in the Project group, marked menu-owned, and says what happens", () => {
		const group = SHORTCUT_GROUPS.find((candidate) =>
			candidate.entries.some((entry) => entry.action === "New window"),
		);
		expect(group?.title).toBe("Project");
		const entry = entries.find((candidate) => candidate.action === "New window");
		expect(entry?.keys).toEqual(["Cmd", "Shift", "N"]);
		expect(entry?.menu).toBe(true);
		expect(entry?.note).toContain("File ▸ New Window owns this chord");
	});
});
