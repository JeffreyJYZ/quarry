import { useEffect, useRef, useState } from "react";
import type { DebugController, StopView } from "@/lib/debug/session";
import { fileName } from "@/lib/problems/model";

/** The stop reason and the frame list; a frame click selects it and opens its source line. */
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
	const framesRef = useRef(view?.frames);
	// Clear the navigation marker whenever a new stop arrives (frames array changes), so a stale
	// frame never stays marked; selecting a frame keeps its array identity and the marker survives.
	useEffect(() => {
		if (framesRef.current !== view?.frames) {
			framesRef.current = view?.frames;
			setNavigated(null);
		}
	}, [view]);

	return (
		<section className="debug-section debug-frames">
			<div className="debug-section-head">
				<span className="label">frames</span>
				<span className="debug-count">{view === null ? 0 : view.frames.length}</span>
			</div>
			{view === null ? null : (
				<p className="debug-stop" title={view.description ?? undefined}>
					{view.description === null
						? view.reason
						: `${view.reason} · ${view.description}`}
				</p>
			)}
			<div className="debug-scroll">
				{view === null ? (
					<p className="debug-note">Not stopped</p>
				) : view.frames.length === 0 ? (
					<p className="debug-note">No frames</p>
				) : (
					view.frames.map((frame) => {
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
						if (!navigable || frame.source === null) {
							return (
								<span
									key={frame.id}
									className={className}
									title={frame.source ?? undefined}
									style={marked ? { opacity: 0.55 } : undefined}
								>
									{content}
								</span>
							);
						}
						const source = frame.source;
						return (
							<button
								key={frame.id}
								type="button"
								className={className}
								title={source}
								style={marked ? { opacity: 0.55 } : undefined}
								onClick={() => {
									debug.selectFrame(frame.id);
									setNavigated({ source, line: frame.line });
									onNavigate?.(source, frame.line - 1, 0);
								}}
							>
								{content}
							</button>
						);
					})
				)}
			</div>
		</section>
	);
}
