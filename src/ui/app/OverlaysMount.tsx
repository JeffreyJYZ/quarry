import { generateItems } from "@/lib/generate/model";
import { DEFAULT_PROJECT_SETTINGS } from "@/lib/settings/model";
import { languageLabel } from "@/ui/app/shellShortcuts";
import AppOverlays from "@/ui/app/AppOverlays";
import type { ShellModel } from "@/ui/app/useShell";

/** Everything modal or floating: settings, diffs, references, goto, generate, new project. */
export default function OverlaysMount({ model }: { model: ShellModel }) {
	const { workspace, overlays, panels, settings, git, diagnostics } = model;
	const cursor = overlays.cursor;
	const active = model.active;

	return (
		<AppOverlays
			root={model.root}
			project={workspace.project}
			activePath={model.activePath}
			counts={diagnostics.counts}
			gitStatus={git.status}
			missingTools={model.missingTools}
			saveError={model.saveError}
			caret={cursor === null ? null : { line: cursor.line + 1, column: cursor.character + 1 }}
			language={languageLabel(model.activePath)}
			tabSize={settings.effective.editorTabSize}
			server={
				model.root === null
					? null
					: model.lspStatus === undefined || model.lspStatus === null
						? "lsp starting"
						: model.lspStatus.server
			}
			onOpenSettings={() => panels.setSettingsOpen(true)}
			references={overlays.references}
			refsOpen={overlays.refsOpen}
			onCloseRefs={() => overlays.setRefsOpen(false)}
			onNavigate={workspace.handleNavigate}
			gitDiffPath={panels.gitDiffPath}
			onCloseGitDiff={() => panels.setGitDiffPath(null)}
			gitCommitDiffHash={panels.gitCommitDiffHash}
			onCloseCommitDiff={() => panels.setGitCommitDiffHash(null)}
			settingsOpen={panels.settingsOpen}
			settingsTab={panels.settingsTab}
			preferences={settings.preferences}
			projectSettings={settings.projectSettings ?? DEFAULT_PROJECT_SETTINGS}
			onCloseSettings={() => panels.setSettingsOpen(false)}
			onPreferencesChange={settings.setPreferences}
			onProjectSettingsChange={settings.handleProjectSettingsChange}
			onResetPanels={settings.resetPanels}
			gotoMode={overlays.gotoMode}
			gotoRecent={workspace.recentFiles}
			onCloseGoto={() => overlays.setGotoMode(null)}
			generateOpen={overlays.generateOpen && active !== null}
			generateItems={
				active === null ? [] : generateItems(active.path, active.text, cursor?.line ?? 0)
			}
			onPickGenerate={model.editorActions.applyGenerate}
			onCloseGenerate={() => overlays.setGenerateOpen(false)}
			newProjectOpen={panels.newProjectOpen}
			newProjectParent={panels.newProjectParent}
			onNewProjectParentChange={panels.setNewProjectParent}
			onCloseNewProject={() => panels.setNewProjectOpen(false)}
			onProjectCreated={(nextRoot) => {
				panels.setNewProjectOpen(false);
				void workspace.openRoot(nextRoot);
			}}
		/>
	);
}
