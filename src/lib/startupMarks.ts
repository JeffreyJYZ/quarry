// Startup marks. Off in normal runs; enable with ?startup=1 in the URL, localStorage "quarry:startup"="1", or DEV builds.
// Timing-based assertions are intentionally absent: these marks are for diagnosis only.
export const startupEnabled =
	import.meta.env.DEV ||
	new URLSearchParams(typeof location !== "undefined" ? location.search : "").has("startup") ||
	(typeof localStorage !== "undefined" && localStorage.getItem("quarry:startup") === "1");

export function startupMark(label: string): void {
	if (!startupEnabled) return;
	performance.mark(`quarry:${label}`);
}

export function startupPrint(label: string, extra?: Record<string, number>): void {
	if (!startupEnabled) return;
	console.groupCollapsed(`[quarry startup] ${label}`);
	try {
		const entries = performance
			.getEntriesByType("mark")
			.filter((m) => m.name.startsWith("quarry:"));
		const base = entries.length ? entries[0].startTime : 0;
		const rows = entries.map((m) => ({
			mark: m.name,
			ms: Math.round((m.startTime - base) * 10) / 10,
			...extra,
		}));
		console.table(rows);
	} finally {
		console.groupEnd();
	}
}
