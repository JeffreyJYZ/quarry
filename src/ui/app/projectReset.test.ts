import { describe, expect, mock, test } from "bun:test";
import { rememberClosed, takeClosed } from "@/lib/editor/closedTabs";
import { resetProjectState } from "@/ui/app/projectReset";

/**
 * What a project switch must clear.
 *
 * The regression this pins: run configurations outlived the project they were written for, so Run in
 * project B launched A's binary, and the closed-tab slot kept offering a buffer from A.
 */
function shellStub() {
	return {
		git: { setRefreshToken: mock(() => {}) },
		panels: {
			setGitDiffPath: mock(() => {}),
			setGitCommitDiffHash: mock(() => {}),
			setSaveStatus: mock(() => {}),
			setPanelOpen: mock(() => {}),
		},
		overlays: { setSearchOpen: mock(() => {}), setShortcutsOpen: mock(() => {}) },
		diagnostics: { reset: mock(() => {}) },
		runs: { replaceConfigurations: mock(() => {}) },
	};
}

describe("resetProjectState", () => {
	test("clears the previous project's run configurations", () => {
		const shell = shellStub();
		resetProjectState(shell as never);
		expect(shell.runs.replaceConfigurations).toHaveBeenCalledWith([]);
	});

	test("forgets the last closed tab, so Ctrl+Shift+T cannot restore another project's buffer", () => {
		rememberClosed({ path: "/old/src/main.rs", name: "main.rs", text: "old", loaded: "old" });
		expect(takeClosed()).not.toBeNull();
		rememberClosed({ path: "/old/src/main.rs", name: "main.rs", text: "old", loaded: "old" });

		resetProjectState(shellStub() as never);

		expect(takeClosed()).toBeNull();
	});

	test("still clears the panels that belong to the old project", () => {
		const shell = shellStub();
		resetProjectState(shell as never);
		expect(shell.panels.setGitDiffPath).toHaveBeenCalledWith(null);
		expect(shell.panels.setPanelOpen).toHaveBeenCalledWith(null);
		expect(shell.overlays.setSearchOpen).toHaveBeenCalledWith(false);
		expect(shell.diagnostics.reset).toHaveBeenCalled();
	});
});
