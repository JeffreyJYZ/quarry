import type { Diagnostic } from "@/lib/project/api";
import { copyLine } from "@/lib/problems/model";
import { ProblemMenu } from "./ProblemMenu";
import { cacheKey, SEVERITY_CLASS, SEVERITY_LABEL } from "./parts";
import type { ProblemActions } from "./useProblemActions";

export function ProblemRow({
	path,
	diagnostic,
	actions,
	onSelect,
	selected,
	rowRef,
	onKeyDown,
}: {
	path: string;
	diagnostic: Diagnostic;
	actions: ProblemActions;
	onSelect: (path: string, line?: number, character?: number) => void;
	selected?: boolean;
	rowRef?: (element: HTMLButtonElement | null) => void;
	/** Arrow-key navigation, owned by the list that knows the row order. */
	onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
	const { line, character } = diagnostic.range.start;
	const key = cacheKey(path, line, character);
	const menuOpen = actions.menuKey === key;
	return (
		<li className="problems-item">
			<button
				type="button"
				ref={rowRef}
				className={selected ? "problems-row selected" : "problems-row"}
				title={diagnostic.message}
				onClick={() => onSelect(path, line, character)}
				onKeyDown={(event) => {
					onKeyDown?.(event);
					if (event.altKey && event.key === "Enter") {
						event.preventDefault();
						void actions.openMenu(path, line, character);
					}
					if (event.key === "Escape") {
						actions.closeMenu();
					}
				}}
			>
				<span
					className={`problem-dot ${SEVERITY_CLASS[diagnostic.severity]}`}
					aria-hidden="true"
				/>
				<span className="problem-pos">
					{line + 1}:{character + 1}
				</span>
				<span className="problem-message">{diagnostic.message}</span>
				<span className="problem-source">
					{diagnostic.source ?? SEVERITY_LABEL[diagnostic.severity]}
				</span>
			</button>
			<button
				type="button"
				className="problem-fix"
				onClick={(event) => {
					event.stopPropagation();
					void actions.openMenu(path, line, character);
				}}
			>
				Fix
			</button>
			<button
				type="button"
				className="problems-file-copy"
				onClick={(event) => {
					event.stopPropagation();
					void navigator.clipboard.writeText(copyLine(path, diagnostic));
				}}
			>
				Copy
			</button>
			{menuOpen ? (
				<ProblemMenu
					actions={actions.menuActions}
					loading={actions.menuLoading}
					index={actions.menuIndex}
					onHover={actions.setMenuIndex}
					onPick={(action) => void actions.applyAction(action)}
				/>
			) : null}
		</li>
	);
}
