import { useEffect, useRef, useState } from "react";
import ExceptionsSection from "@/ui/debug/ExceptionsSection";
import PresetsEditor from "@/ui/debug/PresetsEditor";
import ProcessPicker from "@/ui/debug/ProcessPicker";
import type { DebugController } from "@/lib/debug/session";
import "@/ui/debug/dock/dock-debug-menu.css";

/**
 * The debugger dock's `…` menu: the launch configuration, attach, and the exception filters.
 *
 * Launch itself lives in the title bar, so this menu deliberately has no Launch button — a second
 * one would be the duplicate the title-bar widget exists to remove.
 */
export default function DebugMenu({ debug }: { debug: DebugController }) {
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [attaching, setAttaching] = useState(false);
	const container = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: MouseEvent) => {
			// While the editor is up it owns Escape and outside clicks, so a draft is never lost.
			if (editing) return;
			if (container.current !== null && !container.current.contains(event.target as Node)) {
				setOpen(false);
				setAttaching(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || editing) return;
			setOpen(false);
			setAttaching(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, editing]);

	const session = debug.sessionId;
	const empty = debug.presetEntries.length === 0;

	return (
		<div className="dock-debug-menu" ref={container}>
			<button
				type="button"
				className="dock-action"
				aria-label="Debugger options"
				aria-expanded={open}
				title="Configurations, attach and exception filters"
				onClick={() => {
					setOpen(!open);
					setEditing(false);
					setAttaching(false);
				}}
			>
				…
			</button>
			{open ? (
				<div className="dock-debug-pop" role="dialog" aria-label="Debugger options">
					{editing ? (
						<PresetsEditor
							debug={debug}
							onClose={() => {
								setEditing(false);
								setOpen(false);
							}}
						/>
					) : (
						<>
							<p className="dock-debug-pop-head">configuration</p>
							<div className="dock-debug-pop-row">
								<select
									className="debug-select"
									value={debug.preset}
									aria-label="Launch configuration"
									disabled={empty || session !== null}
									onChange={(event) => debug.setPreset(event.target.value)}
								>
									{empty ? (
										<option value="">no configurations</option>
									) : (
										debug.presetEntries.map((entry) => (
											<option key={entry.value} value={entry.value}>
												{entry.label}
											</option>
										))
									)}
								</select>
							</div>
							<div className="dock-debug-pop-row">
								<button
									type="button"
									className="button"
									onClick={() => setEditing(true)}
								>
									Edit configurations…
								</button>
							</div>
							{debug.resolved === null ? null : (
								<p className="debug-note" title={debug.resolved.program}>
									{debug.resolved.program}
								</p>
							)}
							{debug.configError === null ? null : (
								<p className="debug-note" title={debug.configError}>
									{debug.configError}
								</p>
							)}
							<div className="dock-debug-pop-rule" />
							<div className="dock-debug-pop-row">
								<button
									type="button"
									className="button"
									aria-expanded={attaching}
									disabled={session !== null}
									onClick={() => setAttaching(!attaching)}
								>
									Attach to process…
								</button>
							</div>
							{attaching ? (
								<div className="dock-debug-pop-row dock-debug-pop-wrap">
									<ProcessPicker debug={debug} />
									<button
										type="button"
										className="button"
										disabled={session !== null || debug.status === "launching"}
										onClick={debug.attach}
									>
										Attach
									</button>
								</div>
							) : null}
							<ExceptionsSection debug={debug} session={session} />
						</>
					)}
				</div>
			) : null}
		</div>
	);
}
