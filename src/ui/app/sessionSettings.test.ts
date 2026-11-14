import { describe, expect, test } from "bun:test";
import { DEFAULT_PREFERENCES } from "@/lib/consts/settings";
import { settingsFromSnapshot, type SessionSnapshot } from "@/ui/app/sessionSettings";

function snapshot(): SessionSnapshot {
	return {
		project: {
			root: "/p",
			openedRoot: "/p",
			name: "p",
			kind: "cmake",
			buildRoot: "/p",
			launchConfig: null,
		},
		buffers: [
			{ path: "/p/a.cpp", name: "a.cpp", text: "one", loaded: "one" },
			{ path: "/p/b.cpp", name: "b.cpp", text: "two", loaded: "two" },
		],
		activePath: "/p/b.cpp",
		railCollapsed: true,
		gitOpen: true,
		panelOpen: false,
		dockTab: "run",
		runConfigurations: [{ name: "app", program: "/p/app", args: "", cwd: "/p", env: [] }],
		runForms: [{ root: "/p", program: "/p/custom", args: "", cwd: "/p", env: [] }],
		preferences: DEFAULT_PREFERENCES,
		recentFiles: ["/p/a.cpp"],
		newProjectParent: "/Users/jyz/dev",
	};
}

describe("settingsFromSnapshot", () => {
	test("writes every field the launch would restore", () => {
		expect(settingsFromSnapshot(snapshot())).toEqual({
			lastRoot: "/p",
			openFiles: ["/p/a.cpp", "/p/b.cpp"],
			activeFile: "/p/b.cpp",
			railCollapsed: true,
			gitOpen: true,
			dockTab: "run",
			dockExpanded: false,
			runConfigurations: [{ name: "app", program: "/p/app", args: "", cwd: "/p", env: [] }],
			runForms: [{ root: "/p", program: "/p/custom", args: "", cwd: "/p", env: [] }],
			preferences: DEFAULT_PREFERENCES,
			recentFiles: ["/p/a.cpp"],
			newProjectParent: "/Users/jyz/dev",
		});
	});

	test("no project open clears the root instead of writing a stale one", () => {
		expect(settingsFromSnapshot({ ...snapshot(), project: null }).lastRoot).toBeNull();
	});

	// The guard that would have caught the bug: a field that is restored but never written.
	// The Record forces an entry for every snapshot key, so a new field cannot be forgotten here.
	const CHANGES: Record<keyof SessionSnapshot, (next: SessionSnapshot) => void> = {
		project: (next) => {
			next.project = {
				root: "/other",
				openedRoot: "/other",
				name: "other",
				kind: "cmake",
				buildRoot: "/other",
				launchConfig: null,
			};
		},
		buffers: (next) => {
			next.buffers = [{ path: "/p/c.cpp", name: "c.cpp", text: "", loaded: "" }];
		},
		activePath: (next) => {
			next.activePath = "/p/a.cpp";
		},
		railCollapsed: (next) => {
			next.railCollapsed = false;
		},
		gitOpen: (next) => {
			next.gitOpen = false;
		},
		panelOpen: (next) => {
			next.panelOpen = null;
		},
		dockTab: (next) => {
			next.dockTab = "problems";
		},
		runConfigurations: (next) => {
			next.runConfigurations = [];
		},
		runForms: (next) => {
			next.runForms = [];
		},
		preferences: (next) => {
			next.preferences = { ...DEFAULT_PREFERENCES, editorTabSize: 2 };
		},
		recentFiles: (next) => {
			next.recentFiles = [];
		},
		newProjectParent: (next) => {
			next.newProjectParent = "/Users/jyz/dev/rdm";
		},
	};

	test("every field in the snapshot reaches the file", () => {
		const base = settingsFromSnapshot(snapshot());
		for (const [field, change] of Object.entries(CHANGES)) {
			const next = snapshot();
			change(next);
			expect(settingsFromSnapshot(next), `${field} is read but never written`).not.toEqual(
				base,
			);
		}
	});
});
