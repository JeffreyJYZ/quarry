import type { ProjectInfo } from "@/lib/project/api";
import type { BuildProfile } from "@/lib/settings/model";
import { BUILD_PROFILE_CHOICES } from "@/lib/consts/build";
import type { RefObject } from "react";
import type { ReactNode } from "react";

export type TopBarProps = {
	root: string | null;
	project: ProjectInfo | null;
	opening: boolean;

	buildSplitRef: RefObject<HTMLDivElement | null>;
	buildChevronRef: RefObject<HTMLButtonElement | null>;
	building: boolean;
	buildProfile: BuildProfile;
	buildMenuOpen: boolean;
	onToggleBuildMenu: () => void;
	onOpenBuildMenu: () => void;
	onPickBuildProfile: (profile: BuildProfile) => void;
	onBuild: () => void;

	crumbs?: ReactNode;

	menuBar?: ReactNode;
	right?: ReactNode;
};

/** The title bar: wordmark, menu bar, build profile, crumbs, right slot. */
export default function TopBar(props: TopBarProps) {
	return (
		<header className="titlebar" data-tauri-drag-region="">
			<span className="wordmark">quarry</span>
			<div className="titlebar-nodrag">{props.menuBar}</div>
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
			<span className="crumbs" title={props.project ? props.project.root : undefined}>
				{props.project ? props.project.root : "no project open"}
			</span>
			<div className="titlebar-nodrag titlebar-right">{props.right}</div>
		</header>
	);
}
