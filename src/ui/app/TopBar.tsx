import type { ReactNode } from "react";
import { useFullscreen } from "@/ui/app/useFullscreen";

export type TopBarProps = {
	/** The project dropdown, so the bar stays a frame and the switcher owns its own state. */
	switcher: ReactNode;
	/** The checked-out branch, or null outside a repository. */
	branch: string | null;
	/** Opens the source-control view; the chip is the second door to it, like the rail's button. */
	onBranch?: () => void;
	right?: ReactNode;
};

/** A branch fork, so the name beside the project reads as a git branch and not as a status word. */
function BranchIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.1"
			strokeLinecap="round"
		>
			<circle cx="3" cy="2.6" r="1.3" />
			<circle cx="3" cy="9.4" r="1.3" />
			<circle cx="9" cy="4.4" r="1.3" />
			<path d="M3 3.9v4.2M9 5.7c0 1.9-1.7 2.4-3.6 2.7" />
		</svg>
	);
}

/**
 * The macOS title bar: traffic lights, the project name, the branch, and the right slot.
 *
 * Commands live in the native menu, so there is no in-window menu row; the empty middle stays a
 * drag region.
 */
export default function TopBar({ switcher, branch, onBranch, right }: TopBarProps) {
	const fullscreen = useFullscreen();
	return (
		<header
			className={fullscreen ? "titlebar titlebar-fullscreen" : "titlebar"}
			data-tauri-drag-region=""
		>
			<div className="titlebar-nodrag titlebar-switcher">{switcher}</div>
			{branch === null || onBranch === undefined ? null : (
				<button
					type="button"
					className="titlebar-branch titlebar-nodrag"
					title={`Git branch: ${branch} — click to open source control`}
					aria-label={`Git branch ${branch}, open source control`}
					onClick={onBranch}
				>
					<BranchIcon />
					<span className="titlebar-branch-name">{branch}</span>
				</button>
			)}
			<div className="titlebar-spacer" data-tauri-drag-region="" />
			<div className="titlebar-nodrag titlebar-right">{right}</div>
		</header>
	);
}
