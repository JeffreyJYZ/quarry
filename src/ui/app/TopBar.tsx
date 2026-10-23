import type { ProjectInfo } from "@/lib/project/api";
import type { BuildProfile } from "@/lib/settings/model";
import { BUILD_PROFILE_CHOICES } from "@/lib/consts/build";
import type { DockTab } from "@/ui/tests/TestsDock";
import RecentProjects from "@/ui/projects/RecentProjects";
import type { RefObject } from "react";

export type TopBarProps = {
	root: string | null;
	project: ProjectInfo | null;
	opening: boolean;
	onOpenProject: () => void;
	recentRoots: string[];
	onOpenRoot: (root: string) => void;

	buildSplitRef: RefObject<HTMLDivElement | null>;
	buildChevronRef: RefObject<HTMLButtonElement | null>;
	building: boolean;
	buildProfile: BuildProfile;
	buildMenuOpen: boolean;
	onToggleBuildMenu: () => void;
	onOpenBuildMenu: () => void;
	onPickBuildProfile: (profile: BuildProfile) => void;
	onBuild: () => void;

	runId: string | null;
	onRun: () => void;
	onStop: () => void;

	formatting: boolean;
	activePath: string | null;
	onFormat: () => void;

	gitOpen: boolean;
	onToggleGit: () => void;
	debugOpen: boolean;
	onToggleDebug: () => void;
	panelExpanded: boolean;
	dockTab: DockTab;
	onShowTests: () => void;
	blameOn: boolean;
	onToggleBlame: () => void;
	terminalOpen: boolean;
	onToggleTerminal: () => void;
	onNewProject: () => void;
};

/** The title bar: project actions on the left, panel toggles on the right. */
export default function TopBar(props: TopBarProps) {
	return (
		<header className="titlebar" data-tauri-drag-region="">
			<span className="wordmark">quarry</span>
			<button
				type="button"
				className="button"
				disabled={props.opening}
				onClick={props.onOpenProject}
			>
				{props.opening ? "Opening" : "Open project"}
			</button>
			<RecentProjects
				roots={props.recentRoots}
				current={props.root}
				opening={props.opening}
				onOpen={props.onOpenRoot}
			/>
			<div className="build-split" ref={props.buildSplitRef}>
				<button
					type="button"
					className="button build-main"
					disabled={props.root === null || props.building}
					title={`Build (${props.buildProfile})`}
					onClick={props.onBuild}
				>
					{props.building
						? props.buildProfile === "release"
							? "Building release…"
							: "Building…"
						: "Build"}
				</button>
				<button
					ref={props.buildChevronRef}
					type="button"
					className="button build-chevron"
					disabled={props.root === null || props.building}
					aria-haspopup="menu"
					aria-expanded={props.buildMenuOpen}
					aria-label={`Build profile: ${props.buildProfile}`}
					title={`Build profile: ${props.buildProfile}`}
					onClick={props.onToggleBuildMenu}
					onKeyDown={(event) => {
						if (
							event.key === "ArrowDown" ||
							event.key === "Enter" ||
							event.key === " "
						) {
							event.preventDefault();
							props.onOpenBuildMenu();
						}
					}}
				>
					▾
				</button>
				{props.buildMenuOpen ? (
					<div className="build-menu" role="menu" aria-label="Build profile">
						{BUILD_PROFILE_CHOICES.map((profile) => (
							<button
								key={profile.value}
								type="button"
								role="menuitemradio"
								aria-checked={props.buildProfile === profile.value}
								className={
									props.buildProfile === profile.value
										? "build-menu-item active"
										: "build-menu-item"
								}
								onClick={() => props.onPickBuildProfile(profile.value)}
							>
								{profile.label}
							</button>
						))}
					</div>
				) : null}
			</div>
			<button
				type="button"
				className="button"
				disabled={props.root === null}
				onClick={props.runId !== null ? props.onStop : props.onRun}
			>
				{props.runId !== null ? "Stop" : "Run"}
			</button>
			<button
				type="button"
				className="button"
				disabled={props.root === null || props.activePath === null || props.formatting}
				onClick={props.onFormat}
			>
				{props.formatting ? "Formatting…" : "Format"}
			</button>
			<button
				type="button"
				className="button"
				disabled={props.root === null}
				aria-pressed={props.gitOpen}
				onClick={props.onToggleGit}
			>
				Git
			</button>
			<button
				type="button"
				className="button"
				disabled={props.root === null}
				aria-pressed={props.debugOpen && props.root !== null}
				onClick={props.onToggleDebug}
			>
				Debug
			</button>
			<button
				type="button"
				className="button"
				disabled={props.root === null}
				aria-pressed={props.panelExpanded && props.dockTab === "tests"}
				onClick={props.onShowTests}
			>
				Tests
			</button>
			<button
				type="button"
				className="button"
				disabled={props.root === null || props.activePath === null}
				aria-pressed={props.blameOn}
				onClick={props.onToggleBlame}
			>
				Blame
			</button>
			<button
				type="button"
				className="button"
				disabled={props.root === null}
				aria-pressed={props.terminalOpen}
				onClick={props.onToggleTerminal}
			>
				Terminal
			</button>
			<span className="crumbs" title={props.project ? props.project.root : undefined}>
				{props.project ? props.project.root : "no project open"}
			</span>
			<button
				type="button"
				className="button"
				disabled={props.opening}
				onClick={props.onNewProject}
			>
				New project
			</button>
		</header>
	);
}
