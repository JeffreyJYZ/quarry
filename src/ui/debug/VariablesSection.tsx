import type { DebugController, StopView } from "@/lib/debug/session";
import VariableList from "@/ui/debug/VariablesTree";

/** The scopes of the current stop, each rendering its own variable list. Body only. */
export default function VariablesSection({
	debug,
	view,
}: {
	debug: DebugController;
	view: StopView | null;
}) {
	if (view === null || view.scopes.length === 0) {
		return <p className="debug-note">No scopes</p>;
	}

	return (
		<>
			{view.scopes.map((scope) => (
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
			))}
		</>
	);
}
