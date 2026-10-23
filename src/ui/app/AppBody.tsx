import { Suspense, lazy } from "react";
import type { CSSProperties } from "react";
import { fileName } from "@/lib/problems/model";
import { isDirty } from "@/lib/project/buffer";
import SideRail from "@/ui/app/SideRail";
import EditorColumn from "@/ui/app/EditorColumn";
import Splitter from "@/ui/layout/Splitter";
import type { ShellModel } from "@/ui/app/useShell";

const DebugPanel = lazy(() => import("@/ui/debug/DebugPanel"));
const Terminal = lazy(() => import("@/ui/terminal/Terminal"));

/** The rail and the canvas, with the terminal-on-the-right and debug columns beside them. */
export default function AppBody({ model }: { model: ShellModel }) {
	const { workspace, overlays, panels, settings, git } = model;
	const { railWidth, debugWidth, terminalWidth } = settings.panels;
	const project = workspace.project;

	return (
		<div
			className={[
				"body",
				panels.debugOpen && model.root !== null ? "debug-open" : "",
				panels.railCollapsed ? "rail-collapsed" : "",
			]
				.filter(Boolean)
				.join(" ")}
			style={
				{
					"--rail-width": `${railWidth}px`,
					"--debug-width": `${debugWidth}px`,
					"--terminal-width": `${terminalWidth}px`,
				} as CSSProperties
			}
		>
			<SideRail
				gitOpen={panels.gitOpen}
				project={project}
				root={model.root}
				activePath={model.activePath}
				cursor={overlays.cursor}
				gitStatus={git.status}
				gitRefresh={git.refreshToken}
				blameSaveToken={git.blameSaveToken}
				revealToken={panels.fileRevealToken}
				changes={Object.fromEntries(
					(git.status?.entries ?? []).map((entry) => [entry.path, entry.status]),
				)}
				diffPath={panels.gitDiffPath}
				onOpenFile={workspace.handleOpenFile}
				onOpenGitFile={(path) => void workspace.openPath(path, fileName(path))}
				onFileRenamed={(oldPath, newPath) => {
					workspace.setBuffers((current) =>
						current.map((buffer) =>
							buffer.path === oldPath
								? { ...buffer, path: newPath, name: fileName(newPath) }
								: buffer,
						),
					);
					if (model.activePath === oldPath) workspace.setActivePath(newPath);
				}}
				onFileDeleted={(path) => {
					const buffer = workspace.buffers.find((entry) => entry.path === path);
					if (buffer !== undefined && isDirty(buffer)) {
						model.setNotice(`Deleted ${fileName(path)} (unsaved changes lost)`);
					}
					workspace.setBuffers((current) =>
						current.filter((entry) => entry.path !== path),
					);
					if (model.activePath === path) workspace.setActivePath(null);
				}}
				onReveal={() => panels.setFileRevealToken((current) => current + 1)}
				onRefresh={git.refresh}
				onDiff={panels.setGitDiffPath}
				onCommitDiff={panels.setGitCommitDiffHash}
				onNavigate={workspace.handleNavigate}
			/>

			{panels.railCollapsed ? null : (
				<Splitter
					axis="x"
					value={railWidth}
					min={160}
					max={560}
					label="Resize explorer"
					onChange={(next) => settings.handlePanelResize("railWidth", next)}
				/>
			)}

			<EditorColumn model={model} />

			{project !== null &&
			panels.terminalOpen &&
			settings.effective.terminalPlacement === "right" ? (
				<>
					<Splitter
						axis="x"
						value={terminalWidth}
						min={240}
						max={900}
						invert
						label="Resize terminal"
						onChange={(next) => settings.handlePanelResize("terminalWidth", next)}
					/>
					<Suspense fallback={null}>
						<Terminal
							root={project.root}
							activePath={model.activePath}
							defaultFontSize={settings.effective.terminalFontSize}
							fontFamily={settings.effective.terminalFontFamily}
							placement="right"
						/>
					</Suspense>
				</>
			) : null}

			{panels.debugOpen && model.root !== null ? (
				<>
					<Splitter
						axis="x"
						value={debugWidth}
						min={200}
						max={640}
						invert
						label="Resize debug panel"
						onChange={(next) => settings.handlePanelResize("debugWidth", next)}
					/>
					<Suspense fallback={null}>
						<DebugPanel
							debug={model.debug}
							activePath={model.activePath}
							cursor={overlays.cursor}
							onNavigate={workspace.handleNavigate}
						/>
					</Suspense>
				</>
			) : null}
		</div>
	);
}
