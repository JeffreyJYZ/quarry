import type { ProcessInfo } from "@/lib/project/api";

/**
 * The listbox under the filter box: one option per visible process, still capped by the caller at
 * 50 rows. Keyboard handling lives on the combobox input, so the options are not tab stops.
 */
export default function ProcessOptions({
	listId,
	visible,
	highlight,
	optionId,
	onHighlight,
	onChoose,
}: {
	listId: string;
	visible: ProcessInfo[];
	highlight: number;
	optionId: (pid: number) => string;
	onHighlight: (index: number) => void;
	onChoose: (pid: number) => void;
}) {
	return (
		<div className="debug-pid-list" id={listId} role="listbox" aria-label="Processes">
			{visible.map((process, index) => (
				<button
					key={process.pid}
					id={optionId(process.pid)}
					type="button"
					role="option"
					tabIndex={-1}
					aria-selected={index === highlight}
					className={index === highlight ? "debug-pid-option active" : "debug-pid-option"}
					onMouseDown={(event) => event.preventDefault()}
					onMouseEnter={() => onHighlight(index)}
					onClick={() => onChoose(process.pid)}
				>
					<span className="debug-pid-num">{process.pid}</span>
					<span className="debug-pid-name">{process.name}</span>
				</button>
			))}
		</div>
	);
}
