import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { filterProcesses } from "@/lib/debug/processes";
import type { DebugController } from "@/lib/debug/session";
import { listProcesses, type ProcessInfo } from "@/lib/project/api";
import ProcessOptions from "@/ui/debug/ProcessOptions";
import "@/ui/debug/process-picker.css";

/** How long a fetched process list stays valid before the next focus re-fetches. */
const CACHE_MS = 10_000;

let cached: { data: ProcessInfo[]; expires: number } | null = null;

async function loadProcesses(): Promise<ProcessInfo[]> {
	const now = Date.now();
	if (cached !== null && cached.expires > now) {
		return cached.data;
	}
	const data = await listProcesses();
	cached = { data, expires: Date.now() + CACHE_MS };
	return data;
}

/**
 * Attach-by-pid box that doubles as a filter over every process on the machine: typing narrows the
 * list by name or pid, at most 50 rows at a time, and a bare number still feeds the Attach button
 * beside it. The list re-fetches whenever the box is focused after the 10-second cache lapses.
 */
export default function ProcessPicker({ debug }: { debug: DebugController }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState(() => debug.pidInput);
	const [processes, setProcesses] = useState<ProcessInfo[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const listId = useId();

	const visible = useMemo(
		() => (processes === null ? [] : filterProcesses(processes, query)),
		[processes, query],
	);
	const active = visible[highlight];
	const optionId = (pid: number) => `${listId}-${pid}`;

	const fetchList = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const data = await loadProcesses();
			setProcesses(data);
		} catch (reason) {
			setProcesses(null);
			setLoadError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setLoading(false);
		}
	}, []);

	const onFocus = useCallback(() => {
		setOpen(true);
		if (cached === null || cached.expires <= Date.now() || processes === null) {
			setProcesses(null);
			void fetchList();
		}
	}, [fetchList, processes]);

	const choose = useCallback(
		(pid: number) => {
			debug.setPidInput(String(pid));
			setQuery(String(pid));
			setOpen(false);
			// The controller reads its own pid state, which lands after this render.
			setTimeout(() => debug.attach(), 0);
		},
		[debug],
	);

	const onChange = (value: string) => {
		setQuery(value);
		setHighlight(0);
		const trimmed = value.trim();
		// A bare number is still a pid, so the Attach button beside the box keeps working.
		if (/^[0-9]*$/.test(trimmed)) {
			debug.setPidInput(trimmed);
		}
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		const count = visible.length;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setOpen(true);
			setHighlight((current) => (count === 0 ? 0 : (current + 1) % count));
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setOpen(true);
			setHighlight((current) => (count === 0 ? 0 : (current - 1 + count) % count));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (active !== undefined) {
				choose(active.pid);
				return;
			}
			const typed = query.trim();
			if (/^[0-9]+$/.test(typed)) {
				debug.setPidInput(typed);
				setTimeout(() => debug.attach(), 0);
			}
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
		}
	};

	// Keep the highlight inside the list as the filter narrows.
	useEffect(() => {
		if (highlight >= visible.length) {
			setHighlight(0);
		}
	}, [visible.length, highlight]);

	// Close on outside click.
	useEffect(() => {
		if (!open) return;
		const handler = (event: MouseEvent) => {
			if (
				containerRef.current !== null &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const note = loading
		? "Loading processes…"
		: loadError !== null
			? `Cannot list processes: ${loadError}`
			: visible.length === 0
				? query.trim() === ""
					? "No processes found"
					: "No matching processes"
				: null;

	return (
		<div className="debug-pid-picker" ref={containerRef}>
			<input
				className="debug-pid"
				type="text"
				role="combobox"
				aria-label="Filter processes by name or pid"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={
					open && active !== undefined ? optionId(active.pid) : undefined
				}
				autoComplete="off"
				spellCheck={false}
				placeholder="filter or pid"
				value={query}
				disabled={debug.sessionId !== null}
				onChange={(event) => onChange(event.target.value)}
				onFocus={onFocus}
				onBlur={() => {
					// Defer so a click on a row registers first.
					setTimeout(() => setOpen(false), 120);
				}}
				onKeyDown={onKeyDown}
			/>
			{open && note !== null ? (
				<p className="debug-pid-note" role="status">
					{note}
				</p>
			) : null}
			{open && visible.length > 0 ? (
				<ProcessOptions
					listId={listId}
					visible={visible}
					highlight={highlight}
					optionId={optionId}
					onHighlight={setHighlight}
					onChoose={choose}
				/>
			) : null}
		</div>
	);
}
