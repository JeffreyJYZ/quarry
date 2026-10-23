import type { CodeAction } from "@/lib/project/api";

/** The code actions at the caret, opened with Alt-Enter. */
export default function CodeActionMenu({
	actions,
	onPick,
}: {
	actions: CodeAction[];
	onPick: (action: CodeAction) => void;
}) {
	return (
		<ul className="cm-codeactions">
			{actions.map((action) => (
				<li key={action.title}>
					<button type="button" onClick={() => onPick(action)}>
						{action.title}
					</button>
				</li>
			))}
		</ul>
	);
}
