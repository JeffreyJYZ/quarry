import type { ReactNode } from "react";

export type TopBarProps = {
	/** The project dropdown, so the bar stays a frame and the switcher owns its own state. */
	switcher: ReactNode;
	branch: string | null;
	right?: ReactNode;
};

/**
 * The macOS title bar: traffic lights, the project name, the branch, and the right slot.
 *
 * Commands live in the native menu, so there is no in-window menu row; the empty middle stays a
 * drag region.
 */
export default function TopBar({ switcher, branch, right }: TopBarProps) {
	return (
		<header className="titlebar" data-tauri-drag-region="">
			<div className="titlebar-nodrag titlebar-switcher">{switcher}</div>
			{branch === null ? null : (
				<span className="titlebar-branch" title={branch}>
					{branch}
				</span>
			)}
			<div className="titlebar-spacer" data-tauri-drag-region="" />
			<div className="titlebar-nodrag titlebar-right">{right}</div>
		</header>
	);
}
