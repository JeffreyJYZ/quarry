import { useRef, useState } from "react";
import type { BreakpointField, BreakpointRow } from "@/debug/session";
import { fileName } from "@/problems/model";

const FIELDS: { field: BreakpointField; label: string; title: string }[] = [
	{ field: "condition", label: "cond", title: "Break only when the condition is true" },
	{ field: "logMessage", label: "log", title: "Log the message instead of stopping" },
	{ field: "hitCondition", label: "hit", title: "Stop only on a hit count, e.g. > 3" },
];

function markerFor(row: BreakpointRow): { text: string; title: string } | null {
	const parts: string[] = [];
	const lines: string[] = [];
	for (const { field, label } of FIELDS) {
		const value = row[field];
		if (value === null || value === "") continue;
		parts.push(label);
		lines.push(`${label}: ${value}`);
	}
	if (parts.length === 0) return null;
	return { text: parts.join(""), title: lines.join("\n") };
}

type Props = {
	row: BreakpointRow;
	onEdit: (field: BreakpointField, value: string | null) => void;
	onRemove: (path: string, line: number) => void;
};

export default function BreakpointItem({ row, onEdit, onRemove }: Props) {
	const [editing, setEditing] = useState<BreakpointField | null>(null);
	const [draft, setDraft] = useState("");
	const settled = useRef(false);
	const marker = markerFor(row);

	const start = (next: BreakpointField) => {
		setEditing(next);
		setDraft(row[next] ?? "");
		settled.current = false;
	};

	const commit = (value: string) => {
		if (settled.current || editing === null) return;
		settled.current = true;
		const trimmed = value.trim();
		onEdit(editing, trimmed === "" ? null : trimmed);
		setEditing(null);
	};

	const cancel = () => {
		if (settled.current) return;
		settled.current = true;
		setEditing(null);
	};

	if (editing !== null) {
		return (
			<li className="debug-item debug-bp debug-bp-editing">
				<span className="debug-pos">
					{fileName(row.path)}:{row.line}
				</span>
				<input
					className="debug-bp-input"
					value={draft}
					aria-label={`${editing} for ${fileName(row.path)}:${row.line}`}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commit(draft);
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							cancel();
						}
					}}
					onBlur={() => commit(draft)}
				/>
			</li>
		);
	}

	return (
		<li
			className={
				row.verified === false
					? "debug-item debug-bp unverified"
					: row.verified === null
						? "debug-item debug-bp pending"
						: "debug-item debug-bp"
			}
			title={row.message ?? row.path}
		>
			<span className="debug-pos">
				{fileName(row.path)}:{row.line}
			</span>
			<span className="debug-mem">
				{row.verified === false
					? "unverified"
					: row.verified === null
						? "pending"
						: "verified"}
			</span>
			<span className="debug-bp-marker" title={marker?.title ?? undefined}>
				{marker?.text ?? ""}
			</span>
			{FIELDS.map(({ field, label, title }) => (
				<button
					key={field}
					type="button"
					className="debug-bp-afford"
					title={title}
					onClick={() => start(field)}
				>
					{label}
				</button>
			))}
			<button
				type="button"
				className="debug-remove"
				aria-label={`Remove breakpoint at ${fileName(row.path)}:${row.line}`}
				onClick={() => onRemove(row.path, row.line)}
			>
				×
			</button>
		</li>
	);
}
