import { checkForUpdates } from "@/lib/updates/store";

export function startUpdatePolling(intervalMs = 30 * 60 * 1000): () => void {
	let cancelled = false;
	const run = () => {
		if (cancelled) return;
		void checkForUpdates();
	};
	const initial = setTimeout(run, 8000);
	const handle = setInterval(run, intervalMs);
	return () => {
		cancelled = true;
		clearTimeout(initial);
		clearInterval(handle);
	};
}
