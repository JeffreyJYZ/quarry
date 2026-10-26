import type { ReactNode } from "react";
import TopBar from "@/ui/app/TopBar";
import MenuBar from "@/ui/app/MenuBar";
import { MENU_GROUPS, type MenuGroup } from "@/ui/app/menuGroups";
import type { ShellModel } from "@/ui/app/useShell";

const RECENTS = 5;

/** The last few projects go straight into the File menu, so the old title-bar dropdown is gone. */
function withRecents(groups: MenuGroup[], roots: string[], current: string | null): MenuGroup[] {
	const recent = roots.filter((root) => root !== current).slice(0, RECENTS);
	if (recent.length === 0) return groups;
	return groups.map((group) =>
		group.label === "File"
			? {
					...group,
					items: [
						...group.items,
						"separator",
						...recent.map((root) => ({
							id: `recent:${root}`,
							label: root.slice(root.lastIndexOf("/") + 1) || root,
						})),
					],
				}
			: group,
	);
}

/** The title bar, wired to the shell's one command list so the menu bar and the native menu agree. */
export default function AppTopBar({ model, right }: { model: ShellModel; right?: ReactNode }) {
	const { workspace, build, settings } = model;
	const commands = model.commands;
	const disabled = (id: string) => commands.find((item) => item.id === id)?.disabled === true;
	const groups = withRecents(MENU_GROUPS, workspace.recentRoots, model.root);

	const run = (id: string) => {
		if (id.startsWith("recent:")) {
			const root = id.slice("recent:".length);
			void workspace.openRoot(root).catch((error) => {
				model.settings.onNotice?.(error instanceof Error ? error.message : String(error));
			});
			return;
		}
		model.runCommand(id);
	};

	return (
		<TopBar
			root={model.root}
			project={workspace.project}
			opening={workspace.opening}
			buildSplitRef={build.splitRef}
			buildChevronRef={build.chevronRef}
			building={build.building}
			buildProfile={settings.buildProfile}
			buildMenuOpen={build.menuOpen}
			onToggleBuildMenu={() => build.setMenuOpen((current) => !current)}
			onOpenBuildMenu={() => build.setMenuOpen(true)}
			onPickBuildProfile={(profile) => {
				settings.applyBuildProfile(profile);
				build.setMenuOpen(false);
				build.chevronRef.current?.focus();
			}}
			onBuild={() => void build.build()}
			menuBar={<MenuBar items={commands} groups={groups} onRun={run} disabled={disabled} />}
			right={right}
		/>
	);
}
