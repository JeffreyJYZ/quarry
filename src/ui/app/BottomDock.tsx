import type { FileBuffer as Buffer } from "@/lib/project/buffer";
import { Suspense, lazy } from "react";
import type { DebugController } from "@/lib/debug/session";
import type { RunControls } from "@/ui/app/runControlsTypes";
import Splitter from "@/ui/layout/Splitter";
import TestsDock, { type DockTab, type TestsDockProps } from "@/ui/tests/TestsDock";
import type { ShortcutGroup } from "@/ui/shortcuts/ShortcutSheet";

const SearchPalette = lazy(() => import("@/ui/search/SearchPalette"));
const QuickOpen = lazy(() => import("@/ui/quickopen/QuickOpen"));
const CommandPalette = lazy(() => import("@/ui/palette/CommandPalette"));
const ShortcutSheet = lazy(() => import("@/ui/shortcuts/ShortcutSheet"));

export type DockProps = {
	open: boolean;
	expanded: boolean;
	tab: DockTab;
	dockHeight: number;
	problemFiles: import("@/lib/problems/model").ProblemFile[];
	counts: { errors: number; warnings: number };
	root: string | null;
	activePath: string | null;
	buffers: Buffer[];
	onResize: (height: number) => void;
	onToggleExpanded: () => void;
	onSelectTab: (tab: DockTab) => void;
	onSelectProblem: (path: string, line?: number, character?: number) => void;
	onBuffersChange: (updater: (current: Buffer[]) => Buffer[]) => void;
	debug: DebugController;
	cursor: { line: number; character: number } | null;
	onNavigate: (path: string, line: number, character: number) => void;
	tests: TestsDockProps["tests"];
	runs: RunControls;
};

/** The bottom dock: problems, tests and the debugger share one region and one header. */
export default function BottomDock(props: DockProps) {
	if (!props.open) return null;
	return (
		<>
			{props.expanded ? (
				<Splitter
					axis="y"
					value={props.dockHeight}
					min={120}
					max={900}
					invert
					label="Resize bottom dock"
					onChange={props.onResize}
				/>
			) : null}
			<TestsDock
				tab={props.tab}
				expanded={props.expanded}
				onToggleExpanded={props.onToggleExpanded}
				onSelectTab={props.onSelectTab}
				debug={props.debug}
				activePath={props.activePath}
				cursor={props.cursor}
				onNavigate={props.onNavigate}
				problems={{
					files: props.problemFiles,
					errors: props.counts.errors,
					warnings: props.counts.warnings,
					activePath: props.activePath,
					onSelect: props.onSelectProblem,
					root: props.root,
					buffers: props.buffers,
					setBuffers: props.onBuffersChange,
				}}
				tests={props.tests}
				runs={props.runs}
			/>
		</>
	);
}

export type PaletteProps = {
	root: string | null;
	searchOpen: boolean;
	quickOpenOpen: boolean;
	shortcutsOpen: boolean;
	groups: ShortcutGroup[];
	commandOpen: boolean;
	openPaths: Set<string>;
	commands: import("@/ui/palette/CommandPalette").Command[];
	recentCommands: string[];
	onRecentCommands: (next: string[]) => void;
	onOpenMatch: (path: string) => void;
	onOpenQuick: (path: string) => void;
	onCloseSearch: () => void;
	onCloseQuick: () => void;
	onCloseShortcuts: () => void;
	onCloseCommands: () => void;
};

/** The floating palettes that hang over the editor. */
export function Palettes(props: PaletteProps) {
	return (
		<>
			{props.searchOpen && props.root !== null ? (
				<Suspense fallback={null}>
					<SearchPalette
						root={props.root}
						onOpen={props.onOpenMatch}
						onClose={props.onCloseSearch}
					/>
				</Suspense>
			) : null}
			{props.quickOpenOpen && props.root !== null ? (
				<Suspense fallback={null}>
					<QuickOpen
						root={props.root}
						openPaths={props.openPaths}
						onOpen={props.onOpenQuick}
						onClose={props.onCloseQuick}
					/>
				</Suspense>
			) : null}
			{props.shortcutsOpen ? (
				<ShortcutSheet groups={props.groups} onClose={props.onCloseShortcuts} />
			) : null}
			<Suspense fallback={null}>
				<CommandPalette
					open={props.commandOpen}
					commands={props.commands}
					recent={props.recentCommands}
					onRecent={props.onRecentCommands}
					onClose={props.onCloseCommands}
				/>
			</Suspense>
		</>
	);
}
