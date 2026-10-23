import type { CodeAction } from "@/lib/project/api";

export function ProblemMenu({
	actions,
	loading,
	index,
	onHover,
	onPick,
}: {
	actions: CodeAction[];
	loading: boolean;
	index: number;
	onHover: (index: number) => void;
	onPick: (action: CodeAction) => void;
}) {
	return (
		<div className="problem-menu">
			{loading ? (
				<div className="problem-menu-loading">Loading…</div>
			) : (
				actions.map((action, actionIndex) => (
					<button
						type="button"
						key={action.title}
						className={
							actionIndex === index ? "problem-menu-item active" : "problem-menu-item"
						}
						onMouseEnter={() => onHover(actionIndex)}
						onClick={(event) => {
							event.stopPropagation();
							onPick(action);
						}}
					>
						{action.title}
					</button>
				))
			)}
		</div>
	);
}
