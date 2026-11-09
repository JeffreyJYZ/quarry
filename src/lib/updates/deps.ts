import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkUpdater, type Update } from "@tauri-apps/plugin-updater";
import { withTimeout } from "@/lib/updates/notes";

/** Where the release list lives; the only network call the fallback check makes. */
const RELEASE_URL = "https://api.github.com/repos/JeffreyJYZ/quarry/releases/latest";

/**
 * How long the GitHub lookup may take before it is abandoned.
 *
 * The check runs while the panel says "checking", so a request that never settles leaves the panel
 * there for the session. Eight seconds matches the release-notes lookup.
 */
export const UPDATE_FETCH_TIMEOUT_MS = 8000;

/** The outside world the updater touches, behind one object so tests can replace it.
 *
 * `setUpdateDeps` is used by the update tests and by the store's own reset; production never calls
 * it, so the real implementations below are the ones that ship.
 */
export type Deps = {
	checkUpdater: () => Promise<Update | null>;
	fetchGithub: () => Promise<{ version: string } | null>;
	currentVersion: () => Promise<string>;
	relaunch: () => Promise<void>;
};

export type GithubFetch = (
	url: string,
	signal: AbortSignal,
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * The latest release's version, or `null` when it cannot be read in time.
 *
 * The abort signal cancels the request itself, and the per-call timeout also bounds the body read,
 * so a stub or a platform that ignores the signal cannot hold the panel.
 */
export async function fetchLatestRelease(
	fetchImpl: GithubFetch = fetch as unknown as GithubFetch,
	timeoutMs: number = UPDATE_FETCH_TIMEOUT_MS,
): Promise<{ version: string } | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const deadline = Date.now() + timeoutMs;
	const remaining = () => Math.max(1, deadline - Date.now());

	try {
		const response = await withTimeout(fetchImpl(RELEASE_URL, controller.signal), remaining());
		if (!response.ok) return null;
		const body = (await withTimeout(response.json(), remaining())) as {
			tag_name?: unknown;
			name?: unknown;
		};
		const raw =
			typeof body.tag_name === "string"
				? body.tag_name
				: typeof body.name === "string"
					? body.name
					: null;
		if (raw === null) return null;
		return { version: raw.replace(/^v/, "") };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		// The timer is not guaranteed to have run before the race settles, so a timed-out call aborts
		// here instead of relying on it: the request must be cancelled, not merely abandoned.
		if (Date.now() >= deadline) controller.abort();
	}
}

const defaultDeps: Deps = {
	checkUpdater: () => checkUpdater(),
	fetchGithub: () => fetchLatestRelease(),
	currentVersion: () => getVersion(),
	relaunch: () => relaunch(),
};

let deps: Deps = { ...defaultDeps };

export function getDeps(): Deps {
	return deps;
}

export function setUpdateDeps(next: Partial<Deps>): void {
	deps = { ...deps, ...next };
}

export function resetUpdateDeps(): void {
	deps = { ...defaultDeps };
}
