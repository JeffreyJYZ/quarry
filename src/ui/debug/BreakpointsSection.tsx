import BreakpointItem from "@/ui/debug/BreakpointItem";
import type { DebugController } from "@/lib/debug/session";
import { fileName } from "@/lib/problems/model";

/**
 * Every set breakpoint, grouped by file. Body only: the column header carries the Add button,
 * which adds the top frame's line.
 */
export default function BreakpointsSection({ debug }: { debug: DebugController }) {
	if (debug.breakpoints.length === 0) {
		return <p className="debug-note">None. Click the editor gutter to set one.</p>;
	}

	return (
		<>
			{[...debug.breakpointsByPath.entries()]
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
				))}
		</>
	);
}
