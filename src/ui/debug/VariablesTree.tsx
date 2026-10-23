import { useCallback, useEffect, useState } from "react";
import type { DebugController, VariableRow } from "@/lib/debug/session";
import type { DapVariable } from "@/lib/project/api";

type VariableListProps = {
	variables: DapVariable[];
	containerRef: number;
	prefix: string;
	depth: number;
	debug: DebugController;
	pathNames: string[];
	scopeRef: number;
};

/** One container's rows; recursion only happens through an expanded parent row. */
export default function VariableList({
	variables,
	containerRef,
	prefix,
	depth,
	debug,
	pathNames,
	scopeRef,
}: VariableListProps) {
	return (
		<>
			{variables.map((variable, index) => {
				const row: VariableRow = {
					key: `${prefix}/${index}`,
					containerRef,
					scopeReference: scopeRef,
					path: pathNames,
					depth,
					name: variable.name,
					value: variable.value,
					typeName: variable.typeName,
					variablesReference: variable.variablesReference,
					memoryReference: variable.memoryReference,
				};
				return <VariableBranch key={row.key} row={row} debug={debug} />;
			})}
		</>
	);
}

function VariableBranch({ row, debug }: { row: VariableRow; debug: DebugController }) {
	const expandable = row.variablesReference > 0;
	const editable = !expandable;
	const open = expandable && debug.expanded.has(row.key);
	const children = open ? (debug.children.get(row.variablesReference) ?? null) : null;
	const selected = debug.selectedVariable !== null && debug.selectedVariable.key === row.key;
	const watching = debug.status === "stopped";
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(row.value);
	const [inFlight, setInFlight] = useState(false);

	const submit = useCallback(async () => {
		if (inFlight) return;
		if (draft === row.value) {
			setEditing(false);
			return;
		}
		setInFlight(true);
		try {
			await debug.setVariable(row, draft);
			setEditing(false);
		} catch {
			setDraft(row.value);
			setEditing(false);
		} finally {
			setInFlight(false);
		}
	}, [debug, draft, inFlight, row]);

	const cancel = useCallback(() => {
		setDraft(row.value);
		setEditing(false);
	}, [row.value]);

	// Keep draft in sync if the row value changes externally.
	useEffect(() => {
		if (!editing) setDraft(row.value);
	}, [editing, row.value]);

	return (
		<>
			<div
				className={
					selected
						? inFlight
							? "debug-var selected dimmed"
							: "debug-var selected"
						: inFlight
							? "debug-var dimmed"
							: "debug-var"
				}
			>
				<span className="debug-var-indent" style={{ width: row.depth * 10 }} />
				<button
					type="button"
					className="debug-twisty"
					disabled={!expandable}
					aria-label={open ? "Collapse" : "Expand"}
					aria-expanded={open}
					onClick={() => debug.toggleVariable(row)}
				>
					{expandable ? (
						<span className={open ? "debug-caret open" : "debug-caret"} />
					) : null}
				</button>
				<button
					type="button"
					className="debug-var-main"
					title={row.typeName ?? undefined}
					onClick={() => debug.selectVariable(row)}
				>
					<span className="debug-var-name">{row.name}</span>
					{editing ? (
						<input
							className="debug-var-input"
							value={draft}
							disabled={inFlight}
							// biome-ignore lint/a11y/noAutofocus: inline edit needs focus
							autoFocus
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void submit();
								} else if (event.key === "Escape") {
									event.preventDefault();
									cancel();
								}
							}}
							onBlur={() => {
								if (draft !== row.value) void submit();
								else cancel();
							}}
						/>
					) : editable ? (
						// biome-ignore lint/a11y/noStaticElementInteractions: double-click to edit
						<span
							className="debug-var-value"
							onDoubleClick={() => {
								setDraft(row.value);
								setEditing(true);
							}}
						>
							{row.value}
						</span>
					) : (
						<span className="debug-var-value">{row.value}</span>
					)}
					{row.memoryReference === null ? null : (
						<span className="debug-var-mem">{row.memoryReference}</span>
					)}
				</button>
				<button
					type="button"
					className="debug-watch"
					disabled={!watching}
					title={`Watch ${row.name}`}
					onClick={() => debug.addWatchPoint(row.containerRef, row.name)}
				>
					watch
				</button>
				<button
					type="button"
					className="debug-pin"
					disabled={!watching}
					title={`Pin ${row.name}`}
					onClick={() => debug.togglePin(row)}
				>
					{debug.isPinned(row) ? "•" : "pin"}
				</button>
			</div>
			{open && children !== null ? (
				<VariableList
					variables={children}
					containerRef={row.variablesReference}
					prefix={row.key}
					depth={row.depth + 1}
					debug={debug}
					pathNames={[...row.path, row.name]}
					scopeRef={row.scopeReference}
				/>
			) : null}
		</>
	);
}
