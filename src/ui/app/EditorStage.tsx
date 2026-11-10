import type { DiagnosticMap } from "@/lib/lsp/diagnostics";
import { type FileBuffer, documentId } from "@/lib/project/buffer";
import type { Preferences } from "@/lib/settings/model";
import type { EditorHandle } from "@/ui/editor/Editor";
import Breadcrumb from "@/ui/breadcrumb/Breadcrumb";
import LazyEditor from "@/ui/editor/LazyEditor";
import TabStrip from "@/ui/components/TabStrip";
import Welcome from "@/ui/components/Welcome";
import DisasmSplitPane from "@/ui/app/DisasmSplitPane";
import SplitPane, { type SplitView } from "@/ui/app/SplitPane";
import type { Location, ProjectInfo } from "@/lib/project/api";
import type { TestMarker } from "@/lib/tests/gutter";
import type { TodoGutterProps } from "@/ui/editor/editorTypes";
import type { RefObject } from "react";
import { type DisasmSplit, useEditorReveal } from "@/ui/app/useStableProps";

export type EditorStageProps = {
	/** The assembly split, or null when it is closed. */
	disasm: DisasmSplit;
	/** The second code pane, or null when it is closed. */
	split: SplitView | null;
	/** True while that pane is on screen, so the tab-strip button can report its state. */
	splitOpen: boolean;
	project: ProjectInfo | null;
	root: string | null;
	active: FileBuffer | null;
	activePath: string | null;
	buffers: FileBuffer[];
	/** Projects opened before, newest first, for the welcome screen. */
	recentRoots: string[];
	onOpenRecent: (root: string) => void;
	onOpenProject: () => void;
	saving: ReadonlySet<string>;
	confirmClose: string | null;
	cursor: { line: number; character: number } | null;
	effective: Preferences;

	editorRef: RefObject<EditorHandle | null>;
	diagnostics: DiagnosticMap;
	breakpointLines: number[];
	unverifiedLines: number[];
	/** Run buttons for the active file's tests, drawn in the editor's own gutter. */
	testMarkers: TestMarker[];
	/** Comment markers for the active buffer, drawn in the editor's own gutter. */
	todo?: TodoGutterProps;
	bookmarkLines: number[];
	blameOn: boolean;
	blameByPath: Map<string, { line: number; label: string }[]>;
	revealTarget: { line: number; character: number } | null;
	revealToken: number;

	onActivate: (path: string) => void;
	onClose: (path: string) => void;
	onSaveClose: (path: string) => void;
	onDiscardClose: (path: string) => void;
	onCancelClose: () => void;
	onChange: (text: string) => void;
	/** Text from the split pane: it names its own file, never the active one. */
	onChangeFor: (path: string, text: string) => void;
	onToggleSplit: () => void;
	onNavigate: (path: string, line: number, character: number) => void;
	onReferences: (locations: Location[]) => void;
	onCursor: (position: { line: number; character: number }) => void;
	onApplyEdits: (edits: import("@/lib/project/api").FileEdit[]) => void;
	onToggleBreakpoint: (line: number) => void;
	onTestMarker: (marker: TestMarker, group: boolean) => void;
	onToggleBookmark: (line: number) => void;
	onNotice: (message: string | null) => void;
};

/**
 * The editor column: tab strip, breadcrumb and the code surface, or the welcome screen when
 * nothing is open.
 *
 * The left pane owns the shell's editor handle and the reveal requests; the split pane beside it is
 * a read-and-edit surface only, so save and format-on-save always act on the active tab.
 */
export default function EditorStage(props: EditorStageProps) {
	const reveal = useEditorReveal(props.revealTarget, props.revealToken);
	const active = props.active;
	if (active === null)
		return (
			<Welcome
				project={props.project}
				recent={props.recentRoots}
				onOpenRecent={props.onOpenRecent}
				onOpenProject={props.onOpenProject}
			/>
		);

	return (
		<>
			<TabStrip
				buffers={props.buffers}
				activePath={props.activePath}
				saving={props.saving}
				confirmClose={props.confirmClose}
				onActivate={props.onActivate}
				onClose={props.onClose}
				onSaveClose={props.onSaveClose}
				onDiscardClose={props.onDiscardClose}
				onCancelClose={props.onCancelClose}
				splitOpen={props.splitOpen}
				onToggleSplit={props.onToggleSplit}
			/>
			<Breadcrumb
				root={props.root ?? ""}
				activePath={props.activePath}
				cursor={props.cursor}
				onNavigate={props.onNavigate}
			/>
			<div className="editor-pane">
				{/* Keyed on the document, not the pane: a new id disposes the view. The id also names the
				    cached state, so a tab switch comes back to its undo history, caret and scroll while a
				    reload — which bumps the load id — is a new document and starts empty. */}
				<LazyEditor
					key={documentId(active)}
					documentId={documentId(active)}
					ref={props.editorRef}
					path={active.path}
					value={active.text}
					onChange={props.onChange}
					root={props.root}
					onNotice={props.onNotice}
					diagnostics={props.diagnostics.get(active.path)}
					breakpointLines={props.breakpointLines}
					unverifiedLines={props.unverifiedLines}
					onToggleBreakpoint={props.onToggleBreakpoint}
					testMarkers={props.testMarkers}
					onTestMarker={props.onTestMarker}
					bookmarkLines={props.bookmarkLines}
					onToggleBookmark={props.onToggleBookmark}
					todo={props.todo}
					onNavigate={props.onNavigate}
					onReferences={props.onReferences}
					onCursor={props.onCursor}
					onApplyEdits={props.onApplyEdits}
					tabSize={props.effective.editorTabSize}
					fontSize={props.effective.editorFontSize}
					fontFamily={props.effective.editorFontFamily}
					blame={props.blameOn ? (props.blameByPath.get(active.path) ?? null) : null}
					reveal={reveal}
				/>
				{props.split === null ? null : (
					<SplitPane
						split={props.split}
						root={props.root}
						tabSize={props.effective.editorTabSize}
						fontSize={props.effective.editorFontSize}
						fontFamily={props.effective.editorFontFamily}
						diagnostics={props.diagnostics}
						breakpointLines={props.breakpointLines}
						unverifiedLines={props.unverifiedLines}
						bookmarkLines={props.bookmarkLines}
						onChange={props.onChangeFor}
						onNavigate={props.onNavigate}
						onReferences={props.onReferences}
						onCursor={props.onCursor}
						onApplyEdits={props.onApplyEdits}
						onToggleBreakpoint={props.onToggleBreakpoint}
						onTestMarker={props.onTestMarker}
						onToggleBookmark={props.onToggleBookmark}
						onNotice={props.onNotice}
					/>
				)}
				<DisasmSplitPane split={props.disasm} fileName={active.name} />
			</div>
		</>
	);
}
