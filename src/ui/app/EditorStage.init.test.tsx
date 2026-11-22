import { describe, expect, test } from "bun:test";
import { cleanup, render } from "@/test/render";
import type { ProjectInfo } from "@/lib/project/api";
import type { Preferences } from "@/lib/settings/model";
import EditorStage, { type EditorStageProps } from "@/ui/app/EditorStage";

const project = (kind: ProjectInfo["kind"]): ProjectInfo => ({
	root: "/p",
	openedRoot: "/p",
	name: "p",
	kind,
	buildRoot: "/p",
	launchConfig: null,
});

const noop = () => {};

/** The stage only reads these when a buffer is active, which these cases never have. */
const base: EditorStageProps = {
	disasm: null,
	split: null,
	splitOpen: false,
	project: null,
	root: "/p",
	active: null,
	activePath: null,
	buffers: [],
	recentRoots: [],
	onOpenRecent: noop,
	onOpenProject: noop,
	onInitialized: noop,
	saving: new Set<string>(),
	confirmClose: null,
	cursor: null,
	effective: {} as Preferences,
	editorRef: { current: null },
	diagnostics: new Map(),
	breakpointLines: [],
	unverifiedLines: [],
	testMarkers: [],
	bookmarkLines: [],
	blameOn: false,
	blameByPath: new Map(),
	revealTarget: null,
	revealToken: 0,
	onActivate: noop,
	onClose: noop,
	onSaveClose: noop,
	onDiscardClose: noop,
	onCancelClose: noop,
	onChange: noop,
	onChangeFor: noop,
	onToggleSplit: noop,
	onNavigate: noop,
	onReferences: noop,
	onCursor: noop,
	onApplyEdits: noop,
	onToggleBreakpoint: noop,
	onTestMarker: noop,
	onToggleBookmark: noop,
	onNotice: noop,
};

function show(kind: ProjectInfo["kind"] | null) {
	return render(<EditorStage {...base} project={kind === null ? null : project(kind)} />);
}

describe("the initialize panel's trigger", () => {
	test("shows for a folder whose kind is unknown", () => {
		const view = show("unknown");
		expect(view.getByRole("button", { name: "Initialize project" })).toBeTruthy();
		expect(view.queryByText("No file open")).toBeNull();
		cleanup();
	});

	test("does not show for a folder that already has a project", () => {
		for (const kind of ["cargo", "cmake", "compileCommands"] as const) {
			const view = show(kind);
			expect(view.queryByRole("button", { name: "Initialize project" })).toBeNull();
			expect(view.getByText("No file open")).toBeTruthy();
			cleanup();
		}
	});

	test("no project open stays the welcome screen", () => {
		const view = show(null);
		expect(view.queryByRole("button", { name: "Initialize project" })).toBeNull();
		expect(view.getByText("Open a project to begin")).toBeTruthy();
		cleanup();
	});
});
