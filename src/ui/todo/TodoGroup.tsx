import type { TodoFile, TodoRow } from "@/lib/todo/model";
import { directoryOf } from "@/lib/project/paths";

/**
 * One file's markers: the header and its rows.
 *
 * The header carries the count per file, which is the number the panel's total is summed from, so a
 * grouped list can never disagree with the tab.
 */
export function TodoGroup({
	file,
	active,
	onSelect,
}: {
	file: TodoFile;
	active: boolean;
	onSelect: (path: string, line?: number, character?: number) => void;
}) {
	return (
		<li className={active ? "todo-file active" : "todo-file"}>
			<div className="todo-file-head" title={file.path}>
				<span className="todo-file-name">{file.name}</span>
				<span className="todo-file-dir">{directoryOf(file.path)}</span>
				<span className="todo-file-count">{file.rows.length}</span>
			</div>
			<ul className="todo-rows">
				{file.rows.map((row) => (
					<TodoRowButton key={row.line} path={file.path} row={row} onSelect={onSelect} />
				))}
			</ul>
		</li>
	);
}

/** One marker: `line: text`, and the click is the jump. */
function TodoRowButton({
	path,
	row,
	onSelect,
}: {
	path: string;
	row: TodoRow;
	onSelect: (path: string, line?: number, character?: number) => void;
}) {
	return (
		<li className="todo-row-item">
			<button
				type="button"
				className="todo-row"
				title={row.text}
				// ripgrep counts from 1 and the editor from 0; the conversion happens here, once.
				onClick={() => onSelect(path, row.line - 1, 0)}
			>
				<span className="todo-line">{row.line}:</span>
				<span className="todo-text">{row.text}</span>
			</button>
		</li>
	);
}
