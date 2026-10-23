import { useCallback, useEffect, useRef, useState } from "react";
import type { DebugController } from "@/lib/debug/session";
import { listProcesses, type ProcessInfo } from "@/lib/project/api";

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

export default function ProcessPicker({ debug }: { debug: DebugController }) {
	const [open, setOpen] = useState(false);
	const [processes, setProcesses] = useState<ProcessInfo[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	const query = debug.pidInput.trim().toLowerCase();
	const filtered =
		processes === null
			? []
			: query === ""
				? processes
				: processes.filter(
						(process) =>
							String(process.pid).toLowerCase().includes(query) ||
							process.name.toLowerCase().includes(query),
					);

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
		const now = Date.now();
		const expired = cached === null || cached.expires <= now;
		if (expired || processes === null) {
			if (expired) setProcesses(null);
			void fetchList();
		}
	}, [fetchList, processes]);

	const attachHighlighted = useCallback(() => {
		const target = filtered[highlight];
		if (target !== undefined) {
			debug.setPidInput(String(target.pid));
		}
		setTimeout(() => {
			debug.attach();
		}, 0);
	}, [debug, filtered, highlight]);

	const chooseProcess = useCallback(
		(pid: number) => {
			debug.setPidInput(String(pid));
			setTimeout(() => {
				debug.attach();
			}, 0);
			setOpen(false);
		},
		[debug],
	);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlight((current) =>
					filtered.length === 0 ? 0 : (current + 1) % filtered.length,
				);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlight((current) =>
					filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
				);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				attachHighlighted();
				setOpen(false);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setOpen(false);
				return;
			}
		},
		[attachHighlighted, filtered.length],
	);

	// Keep highlight in range as the filter narrows.
	useEffect(() => {
		if (highlight >= filtered.length && filtered.length > 0) {
			setHighlight(filtered.length - 1);
		}
	}, [filtered.length, highlight]);

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

	return (
		<div className="debug-pid-picker" ref={containerRef}>
			<input
				className="debug-pid"
				type="text"
				inputMode="numeric"
				placeholder="pid"
				value={debug.pidInput}
				disabled={debug.sessionId !== null}
				onChange={(event) => debug.setPidInput(event.target.value)}
				onFocus={onFocus}
				onBlur={() => {
					// Defer so a click on a list item registers first.
					setTimeout(() => setOpen(false), 120);
				}}
				onKeyDown={onKeyDown}
			/>
			{open ? (
				<div className="debug-pid-list">
					{loading ? <p className="debug-note">Loading…</p> : null}
					{loadError !== null ? (
						<p className="debug-error" role="status">
							Cannot list processes: {loadError}
						</p>
					) : null}
					{!loading && loadError === null && filtered.length === 0 ? (
						<p className="debug-note">No matching processes</p>
					) : null}
					{!loading && loadError === null
						? filtered.slice(0, 50).map((process, index) => (
								<button
									key={process.pid}
									type="button"
									className={
										index === highlight
											? "debug-pid-option active"
											: "debug-pid-option"
									}
									onMouseDown={(event) => {
										event.preventDefault();
									}}
									onClick={() => chooseProcess(process.pid)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											chooseProcess(process.pid);
										}
									}}
									onMouseEnter={() => setHighlight(index)}
								>
									<span className="debug-pid-num">{process.pid}</span>
									<span className="debug-pid-name">{process.name}</span>
								</button>
							))
						: null}
				</div>
			) : null}
		</div>
	);
}
