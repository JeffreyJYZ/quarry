import { Suspense, lazy } from "react";
import type { CSSProperties } from "react";
import { fileName } from "@/lib/project/paths";
import { runningSessions } from "@/lib/lsp/context";
import { notifyWatchedFiles } from "@/lib/lsp/watchedFiles";
import { isDirty } from "@/lib/project/buffer";
import SideRail from "@/ui/app/SideRail";
import IconRail from "@/ui/app/IconRail";
import EditorColumn from "@/ui/app/EditorColumn";
import Splitter from "@/ui/layout/Splitter";
import { PANEL_LIMITS } from "@/lib/consts/layout";
import { useFileWatch } from "@/ui/app/useFileWatch";
import type { ShellModel } from "@/ui/app/useShell";

const Terminal = lazy(() => import("@/ui/terminal/Terminal"));

/** The rail and the canvas, with the terminal column beside them. */
export default function AppBody({ model }: { model: ShellModel }) {
	const { workspace, overlays, panels, settings, git } = model;
	const { railWidth, terminalWidth } = settings.panels;
	const project = workspace.project;
	const watch = useFileWatch({
		root: project?.root ?? null,
		onPaths: (paths) => {
			// A server that saw this file only when it was opened must hear about the change too,
			// or it keeps analysing text that is no longer on disk.
			const changes = paths.map((path) => ({ path, kind: 2 as const }));
			for (const session of runningSessions()) {
				void notifyWatchedFiles(session, changes).catch(() => {
					/* a server that died is reported by its own commands */
				});
			}
			void workspace.applyExternalChanges(paths, () => {
				// One refresh per batch: the focus handler bumps the same token, so the burst of a
				// rename never asks the source-control view to read git once per path.
				if (panels.gitOpen) git.setRefreshToken((current) => current + 1);
			});
		},
		onError: model.setNotice,
	});

	return (
		<div
			className={["body", panels.railCollapsed ? "rail-collapsed" : ""]
				.filter(Boolean)
				.join(" ")}
			style={
				{
					"--rail-width": `${railWidth}px`,
					"--terminal-width": `${terminalWidth}px`,
				} as CSSProperties
			}
		>
			<IconRail model={model} />
			<SideRail
				gitOpen={panels.gitOpen}
				outlineHeight={settings.panels.outlineHeight}
				onOutlineResize={(next) => settings.handlePanelResize("outlineHeight", next)}
				project={project}
				root={model.root}
				activePath={model.activePath}
				cursor={overlays.cursor}
				gitStatus={git.status}
				gitRefresh={git.refreshToken}
				blameSaveToken={git.blameSaveToken}
				revealToken={panels.fileRevealToken}
				watch={watch}
				changes={Object.fromEntries(
					(git.status?.entries ?? []).map((entry) => [entry.path, entry.status]),
				)}
				diffPath={panels.gitDiffPath}
				onOpenFile={workspace.handleOpenFile}
				onRestartLsp={model.restartLsp}
				onOpenGitFile={(path) => void workspace.openPath(path, fileName(path))}
				onNotice={settings.onNotice}
				onFileRenamed={(oldPath, newPath) => {
					workspace.setBuffers((current) =>
						current.map((buffer) =>
							buffer.path === oldPath
								? { ...buffer, path: newPath, name: fileName(newPath) }
								: buffer,
						),
					);
					if (model.activePath === oldPath) workspace.setActivePath(newPath);
					model.diagnostics.applyEvent({
						type: "rename",
						from: oldPath,
						to: newPath,
					});
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
					model.diagnostics.applyEvent({ type: "close", path });
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
					min={PANEL_LIMITS.railWidth.min}
					max={PANEL_LIMITS.railWidth.max}
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
						min={PANEL_LIMITS.terminalWidth.min}
						max={PANEL_LIMITS.terminalWidth.max}
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
		</div>
	);
}
