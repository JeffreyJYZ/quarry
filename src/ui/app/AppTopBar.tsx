import type { ReactNode } from "react";
import ProjectSwitcher from "@/ui/app/ProjectSwitcher";
import TopBar from "@/ui/app/TopBar";
import type { ShellModel } from "@/ui/app/useShell";

/**
 * The title bar, wired to the shell.
 *
 * Every command it once hosted now lives in the native menu; the bar keeps the project switcher,
 * the branch and the right slot.
 */
export default function AppTopBar({ model, right }: { model: ShellModel; right?: ReactNode }) {
	const { workspace, git, settings } = model;

	// A recent root may have been deleted since it was remembered: report it, never reject unhandled.
	const openRoot = (root: string) => {
		void workspace.openRoot(root).catch((error: unknown) => {
			settings.onNotice(error instanceof Error ? error.message : String(error));
		});
	};

	return (
		<TopBar
			switcher={
				<ProjectSwitcher
					roots={workspace.recentRoots}
					current={model.root}
					onSelectRoot={openRoot}
					onOpenProject={() => void workspace.handleOpenProject()}
					onNewProject={() => model.panels.setNewProjectOpen(true)}
				/>
			}
			branch={git.status?.branch ?? null}
			right={right}
		/>
	);
}
