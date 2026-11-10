import "@/test/dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import type { FileBuffer } from "@/lib/project/buffer";
import type { Settings } from "@/lib/project/api";
import type { SessionSnapshot } from "@/ui/app/sessionSettings";

const settings: Settings = {
	lastRoot: "/p",
	openFiles: ["/p/a.rs", "/p/too-big.rs", "/p/b.rs"],
	activeFile: "/p/b.rs",
};

mock.module("@/lib/project/api", () => ({
	readSettings: async () => settings,
	readTextFile: async (path: string) => {
		if (path === "/p/too-big.rs") throw new Error("File is too large to open");
		return { text: `text of ${path}`, encoding: "utf8" as const };
	},
	settingsForWrite: (preserved: Record<string, unknown>, known: Settings) => ({
		...preserved,
		...known,
	}),
	writeSettings: async () => {},
	openProject: async (root: string) => ({
		root,
		name: "p",
		kind: "cargo",
		buildRoot: root,
		launchConfig: null,
	}),
}));

import { useSessionPersistence } from "@/ui/app/useSessionPersistence";

describe("useSessionPersistence restore", () => {
	afterEach(() => {
		cleanup();
	});

	test("one unreadable tab keeps the rest and names the failure", async () => {
		const buffers: FileBuffer[] = [];
		const notices: string[] = [];
		const setters = {
			onPreferences: () => {},
			onRailCollapsed: () => {},
			onGitOpen: () => {},
			onPanelOpen: () => {},
			onRecentRoots: () => {},
			onRecentFiles: () => {},
			onNewProjectParent: () => {},
			onDockTab: () => {},
			onRunConfigurations: () => {},
			onProject: () => {},
			onBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => {
				buffers.splice(0, buffers.length, ...updater(buffers));
			},
			onActivePath: () => {},
			onNotice: (message: string) => notices.push(message),
		};
		const snapshotRef = { current: null } as unknown as RefObject<SessionSnapshot>;

		const { result } = renderHook(() => useSessionPersistence({ snapshotRef, setters }));
		await waitFor(() => expect(result.current.restoredRef.current).toBe(true));

		expect(buffers.map((buffer) => buffer.path)).toEqual(["/p/a.rs", "/p/b.rs"]);
		expect(notices).toEqual(["could not reopen 1 tab: too-big.rs: File is too large to open"]);
	});
});
