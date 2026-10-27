import { describe, expect, test } from "bun:test";
import { snapshotSignature } from "@/ui/app/sessionSignature";
import type { SessionSnapshot } from "@/ui/app/useSessionPersistence";

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
	return {
		project: null,
		buffers: [],
		activePath: null,
		railCollapsed: false,
		gitOpen: false,
		panelOpen: null,
		dockTab: "problems",
		runConfigurations: [],
		preferences: {},
		recentFiles: [],
		newProjectParent: "",
		...overrides,
	} as SessionSnapshot;
}

describe("snapshotSignature", () => {
	test("typing inside one buffer does not schedule a write", () => {
		const before = snapshotSignature(
			snapshot({ buffers: [{ path: "/p/a.rs", name: "a.rs", text: "x", loaded: "x" }] }),
		);
		const after = snapshotSignature(
			snapshot({ buffers: [{ path: "/p/a.rs", name: "a.rs", text: "xy", loaded: "x" }] }),
		);
		// Only the dirty flag matters: the settings file records paths, not text.
		expect(after).not.toBe(before);
	});

	test("an unrelated render with the same state is stable", () => {
		const state = snapshot({
			activePath: "/p/a.rs",
			buffers: [{ path: "/p/a.rs", name: "a.rs", text: "x", loaded: "x" }],
		});
		expect(snapshotSignature(state)).toBe(snapshotSignature(state));
	});

	test("a new tab, active file or preference changes the token", () => {
		const base = snapshot();
		expect(snapshotSignature(snapshot({ activePath: "/p/a.rs" }))).not.toBe(
			snapshotSignature(base),
		);
		expect(
			snapshotSignature(
				snapshot({ buffers: [{ path: "/p/b.rs", name: "b.rs", text: "", loaded: "" }] }),
			),
		).not.toBe(snapshotSignature(base));
		expect(snapshotSignature(snapshot({ railCollapsed: true }))).not.toBe(
			snapshotSignature(base),
		);
	});

	test("null is the empty token", () => {
		expect(snapshotSignature(null)).toBe("");
	});
});
