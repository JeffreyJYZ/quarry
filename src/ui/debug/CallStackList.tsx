import { useEffect, useRef, useState } from "react";
import type { DebugController, StopView } from "@/lib/debug/session";
import type { DapFrame } from "@/lib/project/api/dap-types";
import { fileName } from "@/lib/problems/model";
import { openDisassembly } from "@/lib/debug/disasm";
import ContextMenu from "@/ui/components/ContextMenu";
import type { MenuItem } from "@/ui/components/ContextMenu";

/**
 * The stop reason and the frame list; a frame click selects it and opens its source line.
 *
 * A right click offers the assembly: CLion opens a disassembly split from a frame, so the frame is
 * selected first and the split then follows it, which keeps stepping and the split in step.
 *
 * Body only: the dock column owns the header and the scroll box, so this renders the rows.
 */
export default function CallStackList({
	debug,
	view,
	onNavigate,
}: {
	debug: DebugController;
	view: StopView | null;
	onNavigate?: (path: string, line: number, character: number) => void;
}) {
	const [navigated, setNavigated] = useState<{ source: string; line: number } | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; frame: DapFrame } | null>(null);
	const framesRef = useRef(view?.frames);
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	// Clear the navigation marker whenever a new stop arrives (frames array changes), so a stale
	// frame never stays marked; selecting a frame keeps its array identity and the marker survives.
	useEffect(() => {
		if (framesRef.current !== view?.frames) {
			framesRef.current = view?.frames;
			setNavigated(null);
			buttonRefs.current = [];
		}
	}, [view]);

	const frameId = view?.frameId;
	const frames = view?.frames;
	// Focus the selected frame on a new stop, so arrow keys continue from where the stop landed.
	useEffect(() => {
		if (frames === undefined || frameId === undefined) return;
		const index = frames.findIndex((frame) => frame.id === frameId);
		if (index >= 0) buttonRefs.current[index]?.focus();
	}, [frames, frameId]);

	if (view === null) {
		return <p className="debug-note">Not stopped</p>;
	}

	const itemsFor = (frame: DapFrame): MenuItem[] => [
		{
			label: "Show disassembly",
			disabled: frame.instructionPointer === null,
			onSelect: () => {
				debug.selectFrame(frame.id);
				openDisassembly();
			},
		},
		{
			label: "Copy frame location",
			disabled: frame.source === null,
			onSelect: () => {
				if (frame.source === null) return;
				void navigator.clipboard.writeText(`${frame.source}:${frame.line}`);
			},
		},
	];

	return (
		<>
			<p className="debug-stop" title={view.description ?? undefined}>
				{view.description === null ? view.reason : `${view.reason} · ${view.description}`}
			</p>
			{view.frames.length === 0 ? (
				<p className="debug-note">No frames</p>
			) : (
				view.frames.map((frame, index) => {
					const navigable = frame.source !== null && frame.line > 0;
					const marked =
						navigated !== null &&
						frame.source === navigated.source &&
						frame.line === navigated.line;
					const className = [
						"debug-frame",
						frame.id === view.frameId ? "active" : "",
						marked && frame.id !== view.frameId ? "navigated" : "",
					]
						.filter(Boolean)
						.join(" ");
					const content = (
						<>
							<span className="debug-frame-name">{frame.name}</span>
							<span className="debug-frame-pos">
								{frame.source === null
									? "—"
									: `${fileName(frame.source)}:${frame.line}`}
							</span>
						</>
					);
					const onContextMenu = (event: React.MouseEvent) => {
						event.preventDefault();
						setMenu({ x: event.clientX, y: event.clientY, frame });
					};
					const source = frame.source;
					return (
						<button
							ref={(element) => {
								buttonRefs.current[index] = element;
							}}
							key={frame.id}
							type="button"
							className={className}
							title={source ?? undefined}
							style={marked ? { opacity: 0.55 } : undefined}
							onContextMenu={onContextMenu}
							onKeyDown={(event) => {
								const frames = view.frames;
								if (event.key === "ArrowDown") {
									event.preventDefault();
									const next = Math.min(index + 1, frames.length - 1);
									buttonRefs.current[next]?.focus();
									const nextFrame = frames[next];
									if (nextFrame !== undefined) debug.selectFrame(nextFrame.id);
									return;
								}
								if (event.key === "ArrowUp") {
									event.preventDefault();
									const prev = Math.max(index - 1, 0);
									buttonRefs.current[prev]?.focus();
									const prevFrame = frames[prev];
									if (prevFrame !== undefined) debug.selectFrame(prevFrame.id);
									return;
								}
								if (event.key === "Enter") {
									event.preventDefault();
									debug.selectFrame(frame.id);
									if (source === null || !navigable) return;
									setNavigated({ source, line: frame.line });
									onNavigate?.(source, frame.line - 1, 0);
								}
							}}
							onClick={() => {
								debug.selectFrame(frame.id);
								if (source === null || !navigable) return;
								setNavigated({ source, line: frame.line });
								onNavigate?.(source, frame.line - 1, 0);
							}}
						>
							{content}
						</button>
					);
				})
			)}
			{menu === null ? null : (
				<ContextMenu
					x={menu.x}
					y={menu.y}
					items={itemsFor(menu.frame)}
					onClose={() => setMenu(null)}
				/>
			)}
		</>
	);
}
