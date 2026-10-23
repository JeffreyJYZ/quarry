import type { DebugController, StopView } from "@/lib/debug/session";
import VariableList from "@/ui/debug/VariablesTree";

/** The scopes of the current stop, each rendering its own variable list. */
export default function VariablesSection({
	debug,
	view,
}: {
	debug: DebugController;
	view: StopView | null;
}) {
	return (
		<section className="debug-section debug-vars">
			<div className="debug-section-head">
				<span className="label">variables</span>
				<span className="debug-count">{view === null ? 0 : view.scopes.length}</span>
			</div>
			<div className="debug-scroll">
				{view === null || view.scopes.length === 0 ? (
					<p className="debug-note">No scopes</p>
				) : (
					view.scopes.map((scope) => (
						<div key={`${scope.name}:${scope.variablesReference}`}>
							<div className="debug-scope-head">{scope.name}</div>
							<VariableList
								variables={debug.children.get(scope.variablesReference) ?? []}
								containerRef={scope.variablesReference}
								prefix={`s${scope.variablesReference}`}
								depth={0}
								debug={debug}
								pathNames={[]}
								scopeRef={scope.variablesReference}
							/>
						</div>
					))
				)}
			</div>
		</section>
	);
}
