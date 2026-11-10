import type { FileEdit, Location } from "@/lib/project/api";
import { type FileBuffer, documentId } from "@/lib/project/buffer";
import type { DiagnosticMap } from "@/lib/lsp/diagnostics";
import { PANEL_LIMITS } from "@/lib/consts/layout";
import type { TestMarker } from "@/lib/tests/gutter";
import LazyEditor from "@/ui/editor/LazyEditor";
import SplitPicker from "@/ui/app/SplitPicker";
import Splitter from "@/ui/layout/Splitter";

/**
 * The right-hand code pane, as the shell resolves it: the buffer, its width and its markers.
 *
 * `buffer` is null when the pane is open with nothing to show — one file open, or the file it held
 * just closed — which is the state the header's picker exists to get out of.
 */
export type SplitView = {
	buffer: FileBuffer | null;
	/** Every open buffer, for the header's picker. */
	buffers: FileBuffer[];
	/** The left pane's file, which the right pane never shows. */
	blockedPath: string | null;
	onPick: (path: string) => void;
	/** Pane width in px; the handle beside it sets the value. */
	width: number;
	/** Gutter markers for this pane's own file, never the active tab's. */
	testMarkers: TestMarker[];
	onWidthChange: (next: number) => void;
	onClose: () => void;
};

export type SplitPaneProps = {
	split: SplitView;
	root: string | null;
	tabSize: number;
	fontSize: number;
	fontFamily: string;
	diagnostics: DiagnosticMap;
	breakpointLines: number[];
	unverifiedLines: number[];
	bookmarkLines: number[];
	/** Text reported by this pane, written to `path` rather than to the active buffer. */
	onChange: (path: string, text: string) => void;
	onNavigate: (path: string, line: number, character: number) => void;
	onReferences: (locations: Location[]) => void;
	onCursor: (position: { line: number; character: number }) => void;
	onApplyEdits: (edits: FileEdit[]) => void;
	onToggleBreakpoint: (line: number) => void;
	onTestMarker: (marker: TestMarker, group: boolean) => void;
	onToggleBookmark: (line: number) => void;
	onNotice: (message: string | null) => void;
};

/**
 * The second code pane.
 *
 * It has no breadcrumb, no caret reporter and no editor handle: the shell's handle stays the left
 * pane's, so save and format-on-save always target the active buffer. What it does have is its own
 * file, its own diagnostics and gutters, and the same fonts as the pane beside it.
 */
export default function SplitPane(props: SplitPaneProps) {
	const { split } = props;
	const { buffer } = split;

	return (
		<>
			<Splitter
				axis="x"
				invert
				value={split.width}
				min={PANEL_LIMITS.splitWidth.min}
				max={PANEL_LIMITS.splitWidth.max}
				label="Resize split editor"
				onChange={split.onWidthChange}
			/>
			<aside
				className="split-pane"
				aria-label="Split editor"
				style={{ width: `${split.width}px` }}
			>
				<header className="split-pane-head">
					<SplitPicker
						buffers={split.buffers}
						root={props.root}
						currentPath={buffer?.path ?? null}
						blockedPath={split.blockedPath}
						onPick={split.onPick}
					/>
					<button
						type="button"
						className="split-pane-close"
						aria-label="Close split editor"
						title="Close split editor"
						onClick={split.onClose}
					>
						×
					</button>
				</header>
				<div className="split-pane-body">
					{buffer === null ? (
						<div className="split-pane-empty">
							<p className="split-pane-empty-text">
								Nothing else is open. Open a second file, then choose it here.
							</p>
						</div>
					) : (
						/* Keyed on the document, exactly like the left pane: a reload starts a new history
						   while a re-open of the same file comes back to its caret and scroll. The id is
						   prefixed so two panes showing one file keep separate caret and undo state. */
						<LazyEditor
							key={`split:${documentId(buffer)}`}
							documentId={`split:${documentId(buffer)}`}
							path={buffer.path}
							value={buffer.text}
							onChange={(text) => props.onChange(buffer.path, text)}
							root={props.root}
							onNotice={props.onNotice}
							diagnostics={props.diagnostics.get(buffer.path)}
							breakpointLines={props.breakpointLines}
							unverifiedLines={props.unverifiedLines}
							onToggleBreakpoint={props.onToggleBreakpoint}
							testMarkers={split.testMarkers}
							onTestMarker={props.onTestMarker}
							bookmarkLines={props.bookmarkLines}
							onToggleBookmark={props.onToggleBookmark}
							onNavigate={props.onNavigate}
							onReferences={props.onReferences}
							onCursor={props.onCursor}
							onApplyEdits={props.onApplyEdits}
							tabSize={props.tabSize}
							fontSize={props.fontSize}
							fontFamily={props.fontFamily}
						/>
					)}
				</div>
			</aside>
		</>
	);
}
