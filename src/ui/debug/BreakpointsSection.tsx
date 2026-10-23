import BreakpointItem from "@/ui/debug/BreakpointItem";
import type { DebugController } from "@/lib/debug/session";
import { fileName } from "@/lib/problems/model";

/** Every set breakpoint, grouped by file, plus the button that adds the top frame's line. */
export default function BreakpointsSection({
	debug,
	canAddBreakpoint,
}: {
	debug: DebugController;
	canAddBreakpoint: boolean;
}) {
	return (
		<section className="debug-section debug-breakpoints">
			<div className="debug-section-head">
				<span className="label">breakpoints</span>
				<button
					type="button"
					className="button"
					disabled={!canAddBreakpoint}
					title={canAddBreakpoint ? "Use the top frame's file and line" : "Stop first"}
					onClick={debug.addBreakpoint}
				>
					Add breakpoint
				</button>
			</div>
			<div className="debug-scroll">
				{debug.breakpoints.length === 0 ? (
					<p className="debug-note">None. Click the editor gutter to set one.</p>
				) : (
					[...debug.breakpointsByPath.entries()]
						.sort(([left], [right]) => (left < right ? -1 : 1))
						.map(([path, rows]) => (
							<div key={path}>
								<div className="debug-scope-head" title={path}>
									{fileName(path)}
								</div>
								<ul className="debug-list">
									{rows.map((breakpoint) => (
										<BreakpointItem
											key={breakpoint.key}
											row={breakpoint}
											onEdit={(field, value) =>
												debug.setBreakpointField(
													breakpoint.path,
													breakpoint.line,
													field,
													value,
												)
											}
											onRemove={debug.removeBreakpoint}
										/>
									))}
								</ul>
							</div>
						))
				)}
			</div>
		</section>
	);
}
