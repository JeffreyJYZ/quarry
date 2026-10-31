import type { DiagnosticMap } from "@/lib/lsp/diagnostics";
import type { FileBuffer } from "@/lib/project/buffer";
import type { Preferences } from "@/lib/settings/model";
import type { EditorHandle } from "@/ui/editor/Editor";
import Breadcrumb from "@/ui/breadcrumb/Breadcrumb";
import LazyEditor from "@/ui/editor/LazyEditor";
import TabStrip from "@/ui/components/TabStrip";
import Welcome from "@/ui/components/Welcome";
import DisasmPane from "@/ui/debug/memory/DisasmPane";
import Splitter from "@/ui/layout/Splitter";
import type { Location, ProjectInfo } from "@/lib/project/api";
import type { RefObject } from "react";

export type EditorStageProps = {
	/** The assembly split, or null when it is closed. */
	disasm: {
		session: string | null;
		address: string | null;
		frameId: number | null;
		/** Split width in px, owned by the shell so the handle and the pane agree. */
		width: number;
		onWidthChange: (next: number) => void;
		onClose: () => void;
	} | null;
	project: ProjectInfo | null;
	root: string | null;
	active: FileBuffer | null;
	activePath: string | null;
	buffers: FileBuffer[];
	saving: ReadonlySet<string>;
	confirmClose: string | null;
	cursor: { line: number; character: number } | null;
	effective: Preferences;

	editorRef: RefObject<EditorHandle | null>;
	diagnostics: DiagnosticMap;
	breakpointLines: number[];
	unverifiedLines: number[];
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
	onNavigate: (path: string, line: number, character: number) => void;
	onReferences: (locations: Location[]) => void;
	onCursor: (position: { line: number; character: number }) => void;
	onApplyEdits: (edits: import("@/lib/project/api").FileEdit[]) => void;
	onToggleBreakpoint: (line: number) => void;
	onNotice: (message: string | null) => void;
};

/**
 * The editor column: tab strip, breadcrumb and the code surface, or the welcome screen when
 * nothing is open.
 */
export default function EditorStage(props: EditorStageProps) {
	const active = props.active;
	if (active === null) return <Welcome project={props.project} />;

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
			/>
			<Breadcrumb
				root={props.root ?? ""}
				activePath={props.activePath}
				cursor={props.cursor}
				onNavigate={props.onNavigate}
			/>
			<div className="editor-pane">
				<LazyEditor
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
					onNavigate={props.onNavigate}
					onReferences={props.onReferences}
					onCursor={props.onCursor}
					onApplyEdits={props.onApplyEdits}
					tabSize={props.effective.editorTabSize}
					fontSize={props.effective.editorFontSize}
					fontFamily={props.effective.editorFontFamily}
					blame={props.blameOn ? (props.blameByPath.get(active.path) ?? null) : null}
					reveal={
						props.revealTarget === null
							? null
							: { ...props.revealTarget, token: props.revealToken }
					}
				/>
				{props.disasm === null ? null : (
					<>
						<Splitter
							axis="x"
							invert
							value={props.disasm.width}
							min={240}
							max={1200}
							label="Resize disassembly"
							onChange={props.disasm.onWidthChange}
						/>
						<aside
							className="editor-split"
							aria-label="Disassembly"
							style={{ width: `${props.disasm.width}px` }}
						>
							<header className="editor-split-head">
								<span className="editor-split-title">{active.name} (assembly)</span>
								<button
									type="button"
									className="editor-split-close"
									aria-label="Close disassembly"
									title="Close disassembly"
									onClick={props.disasm.onClose}
								>
									×
								</button>
							</header>
							<div className="editor-split-body">
								<DisasmPane
									session={props.disasm.session}
									address={props.disasm.address}
									frameId={props.disasm.frameId}
								/>
							</div>
						</aside>
					</>
				)}
			</div>
		</>
	);
}
