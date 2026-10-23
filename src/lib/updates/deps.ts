import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkUpdater, type Update } from "@tauri-apps/plugin-updater";

/**
 * The outside world the updater touches, behind one object so tests can replace it.
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

const defaultDeps: Deps = {
	checkUpdater: () => checkUpdater(),
	fetchGithub: async () => {
		const response = await fetch(
			"https://api.github.com/repos/JeffreyJYZ/quarry/releases/latest",
		);
		if (!response.ok) return null;
		const body = (await response.json()) as { tag_name?: unknown; name?: unknown };
		const raw =
			typeof body.tag_name === "string"
				? body.tag_name
				: typeof body.name === "string"
					? body.name
					: null;
		if (raw === null) return null;
		const version = raw.replace(/^v/, "");
		return { version };
	},
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
