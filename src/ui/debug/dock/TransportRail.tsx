import type { ReactNode } from "react";
import type { DebugController } from "@/lib/debug/session";

/** A 14px icon drawn with a 1px stroke, so the rail reads the same at every density. */
function Icon({ children }: { children: ReactNode }) {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{children}
		</svg>
	);
}

function ContinueIcon() {
	return (
		<Icon>
			<path d="M4 2.5 11.5 7 4 11.5z" />
		</Icon>
	);
}

function StepOverIcon() {
	return (
		<Icon>
			<path d="M2.5 3.5h5a3.5 3.5 0 0 1 3.5 3.5v2.5" />
			<path d="M8.5 7.5 11 10l2.5-2.5" />
		</Icon>
	);
}

function StepIntoIcon() {
	return (
		<Icon>
			<path d="M7 2.5v6.5" />
			<path d="M4.5 6.5 7 9l2.5-2.5" />
			<path d="M3.5 12h7" />
		</Icon>
	);
}

function StepOutIcon() {
	return (
		<Icon>
			<path d="M7 10.5V4" />
			<path d="M4.5 6.5 7 4l2.5 2.5" />
			<path d="M3.5 12h7" />
		</Icon>
	);
}

function RunToCursorIcon() {
	return (
		<Icon>
			<path d="M3 2.5 9.5 7.5 6.4 8.3 4.9 11.5z" />
			<path d="M10.5 10.5 12.5 12.5" />
		</Icon>
	);
}

function RestartIcon() {
	return (
		<Icon>
			<path d="M11.5 7a4.5 4.5 0 1 1-1.7-3.5" />
			<path d="M11.5 2.4v2.7H8.8" />
		</Icon>
	);
}

function StopIcon() {
	return (
		<Icon>
			<path d="M3.5 3.5h7v7h-7z" />
		</Icon>
	);
}

function RailButton({
	label,
	hint,
	disabled = false,
	onClick,
	children,
}: {
	label: string;
	hint?: string;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className="dock-debug-icon"
			aria-label={label}
			title={hint === undefined ? label : `${label} (${hint})`}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

/**
 * The debugger's transport, as icons in CLion's order.
 *
 * Every button drives one `DebugController` method and nothing else; the disabled rules are the
 * adapter's own preconditions, so a press can never send a request the session cannot answer.
 */
export default function TransportRail({
	debug,
	activePath,
	cursor,
}: {
	debug: DebugController;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
}) {
	const stopped = debug.status === "stopped";
	const session = debug.sessionId !== null;
	const cursorKnown = session && activePath !== null && cursor !== null;

	return (
		<div
			className="dock-debug-rail"
			role="toolbar"
			aria-label="Debug transport"
			aria-orientation="vertical"
		>
			<RailButton label="Continue" hint="F9" disabled={!stopped} onClick={debug.continueRun}>
				<ContinueIcon />
			</RailButton>
			<RailButton
				label="Step Over"
				hint="F8"
				disabled={!stopped}
				onClick={() => debug.step("next")}
			>
				<StepOverIcon />
			</RailButton>
			<RailButton
				label="Step Into"
				hint="F7"
				disabled={!stopped}
				onClick={() => debug.step("stepIn")}
			>
				<StepIntoIcon />
			</RailButton>
			<RailButton
				label="Step Out"
				hint="Shift+F8"
				disabled={!stopped}
				onClick={() => debug.step("stepOut")}
			>
				<StepOutIcon />
			</RailButton>
			<RailButton
				label="Run to Cursor"
				disabled={!cursorKnown}
				onClick={() => {
					if (activePath !== null && cursor !== null) {
						debug.runToCursor(activePath, cursor.line + 1);
					}
				}}
			>
				<RunToCursorIcon />
			</RailButton>
			<RailButton
				label={debug.restarting ? "Restarting…" : "Restart"}
				disabled={!session || debug.restarting}
				onClick={debug.restart}
			>
				<RestartIcon />
			</RailButton>
			<RailButton label="Stop" hint="Ctrl+F2" disabled={!session} onClick={debug.stop}>
				<StopIcon />
			</RailButton>
		</div>
	);
}
