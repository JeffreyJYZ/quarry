import { useState } from "react";
import { plural } from "@/lib/problems/model";
import { countTodos, filterTodoFiles, TODO_MARKERS } from "@/lib/todo/model";
import type { TodoController } from "@/lib/todo/useTodos";
import { TodoGroup } from "./TodoGroup";
import "./todo.css";

export type TodoPanelProps = {
	todo: TodoController;
	/** The open file, so its group reads as current. */
	activePath: string | null;
	/** The navigation the Problems panel uses: open the file and reveal the position. */
	onSelect: (path: string, line?: number, character?: number) => void;
};

/** The TODO tool window: every marker in the project, grouped by file, one click from its line. */
export default function TodoPanel({ todo, activePath, onSelect }: TodoPanelProps) {
	const [filter, setFilter] = useState("");
	const files = filterTodoFiles(todo.files, filter);
	// The count follows the list, like Problems: a filtered panel claiming the unfiltered total
	// would be describing rows that are not on screen.
	const shown = countTodos(files);
	const markers = TODO_MARKERS.join(", ");

	return (
		<div className="todo-panel">
			<div className="todo-head">
				<input
					type="search"
					className="todo-filter"
					value={filter}
					// `onInput` rather than `onChange`: the same trigger for a text field, and the one a
					// test can drive — this harness's DOM never dispatches a legacy change event.
					onInput={(event) => setFilter(event.currentTarget.value)}
					placeholder="filter"
					aria-label="Filter TODO markers"
				/>
				<span className="todo-counts">
					{plural(shown, "marker")} in {plural(files.length, "file")}
				</span>
				{todo.truncated ? (
					<span className="todo-truncated">first {shown} shown</span>
				) : null}
				<button
					type="button"
					className="todo-refresh"
					disabled={todo.loading}
					onClick={todo.refresh}
				>
					{todo.loading ? "scanning" : "refresh"}
				</button>
			</div>
			{todo.error === null ? null : <p className="todo-error">{todo.error}</p>}
			<div className="todo-body">
				{todo.files.length === 0 ? (
					todo.loading ? (
						<p className="todo-empty">Scanning for {markers} markers…</p>
					) : (
						<p className="todo-empty">No {markers} markers found</p>
					)
				) : files.length === 0 ? (
					<p className="todo-empty">No markers match the filter "{filter.trim()}"</p>
				) : (
					<ul className="todo-list">
						{files.map((file) => (
							<TodoGroup
								key={file.path}
								file={file}
								active={file.path === activePath}
								onSelect={onSelect}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
