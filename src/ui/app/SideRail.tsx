import type { GitStatus, ProjectInfo } from "@/lib/project/api";
import type { FileEntry } from "@/lib/project/api";
import FileTree from "@/ui/components/FileTree";
import Outline from "@/ui/outline/Outline";
import SourceControl from "@/ui/git/SourceControl";
import Splitter from "@/ui/layout/Splitter";
import { PANEL_LIMITS } from "@/lib/layout/model";

const OUTLINE_MIN = PANEL_LIMITS.outlineHeight.min;
const OUTLINE_MAX = PANEL_LIMITS.outlineHeight.max;

export type SideRailProps = {
	gitOpen: boolean;
	/** Height of the outline under the tree, in pixels. */
	outlineHeight: number;
	onOutlineResize: (height: number) => void;
	project: ProjectInfo | null;
	root: string | null;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	gitStatus: GitStatus | null;
	gitRefresh: number;
	blameSaveToken: number;
	revealToken: number;
	changes: Record<
		string,
		"modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted"
	>;
	diffPath: string | null;
	onOpenFile: (entry: FileEntry) => void;
	onOpenGitFile: (path: string) => void;
	onFileRenamed: (oldPath: string, newPath: string) => void;
	onFileDeleted: (path: string) => void;
	onReveal: () => void;
	onRefresh: () => Promise<void>;
	onDiff: (path: string | null) => void;
	onCommitDiff: (hash: string | null) => void;
	onNavigate: (path: string, line: number, character: number) => void;
};

/**
 * The left column: source control when it is open, otherwise the project explorer and its outline.
 */
export default function SideRail(props: SideRailProps) {
	if (props.gitOpen && props.root !== null) {
		return (
			<SourceControl
				root={props.root}
				refreshToken={props.gitRefresh}
				status={props.gitStatus}
				activePath={props.activePath}
				saveToken={props.blameSaveToken}
				onRefresh={props.onRefresh}
				onOpenFile={props.onOpenGitFile}
				onDiff={props.onDiff}
				onCommitDiff={props.onCommitDiff}
				onNavigate={props.onNavigate}
				diffPath={props.diffPath}
			/>
		);
	}

	return (
		<aside className="rail">
			<div className="rail-head">
				<span className="label">explorer</span>
				<button
					type="button"
					className="button"
					disabled={props.root === null || props.activePath === null}
					onClick={props.onReveal}
				>
					Reveal
				</button>
			</div>
			{props.project ? (
				<>
					<FileTree
						key={props.project.root}
						root={props.project.root}
						activePath={props.activePath}
						onOpenFile={props.onOpenFile}
						onFileRenamed={props.onFileRenamed}
						onFileDeleted={props.onFileDeleted}
						revealToken={props.revealToken}
						changes={props.changes}
					/>
					<Splitter
						axis="y"
						value={props.outlineHeight}
						min={OUTLINE_MIN}
						max={OUTLINE_MAX}
						invert
						label="Resize outline"
						onChange={props.onOutlineResize}
					/>
					<div className="outline-fixed" style={{ height: props.outlineHeight }}>
						<Outline
							root={props.project.root}
							activePath={props.activePath}
							onNavigate={props.onNavigate}
							cursor={props.cursor}
						/>
					</div>
				</>
			) : (
				<p className="empty">No folder open. Use Open project to choose one.</p>
			)}
		</aside>
	);
}
