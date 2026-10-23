import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkUpdater, type Update } from "@tauri-apps/plugin-updater";
import { useSyncExternalStore } from "react";
import type { Offer } from "./model";
import { isNewer, progressPercent } from "./model";

export type { Offer } from "./model";
export { isNewer, offerClause, offerHeadline, progressPercent } from "./model";

export type Phase = "idle" | "checking" | "current" | "available" | "downloading" | "failed";

export type State = {
	phase: Phase;
	offer: Offer | null;
	message: string | null;
	progress: number | null;
	dismissed: boolean;
};

type Deps = {
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

export function setUpdateDeps(next: Partial<Deps>): void {
	deps = { ...deps, ...next };
}

export function resetUpdateDeps(): void {
	deps = { ...defaultDeps };
}

let state: State = {
	phase: "idle",
	offer: null,
	message: null,
	progress: null,
	dismissed: false,
};

const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

function setState(next: State): void {
	state = next;
	emit();
}

export function getState(): State {
	return state;
}

export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useUpdates(): State {
	return useSyncExternalStore(subscribe, getState, getState);
}

let currentHandle: Update | null = null;

async function closeHandle(): Promise<void> {
	if (currentHandle !== null) {
		try {
			await currentHandle.close();
		} catch {
			/* ignore */
		}
		currentHandle = null;
	}
}

export async function checkForUpdates(): Promise<void> {
	if (state.phase === "checking" || state.phase === "downloading") {
		return;
	}
	await closeHandle();
	setState({
		phase: "checking",
		offer: null,
		message: null,
		progress: null,
		dismissed: false,
	});
	let offer: Offer | null = null;
	try {
		const current = await deps.currentVersion();
		let updater: Update | null = null;
		try {
			updater = await deps.checkUpdater();
		} catch {
			updater = null;
		}
		if (updater !== null) {
			if (isNewer(updater.version, current)) {
				currentHandle = updater;
				offer = { kind: "updater", version: updater.version, update: updater };
			} else {
				try {
					await updater.close();
				} catch {
					/* ignore */
				}
			}
		}
		if (offer === null) {
			let githubVersion: string | null = null;
			try {
				const result = await deps.fetchGithub();
				githubVersion = result?.version ?? null;
			} catch {
				githubVersion = null;
			}
			if (githubVersion !== null && isNewer(githubVersion, current)) {
				offer = { kind: "github", version: githubVersion };
			}
		}
	} catch {
		offer = null;
	}
	setState({
		phase: offer === null ? "current" : "available",
		offer,
		message: null,
		progress: null,
		dismissed: false,
	});
}

export async function installNow(): Promise<void> {
	const offer = state.offer;
	if (offer === null || offer.kind !== "updater") {
		return;
	}
	const update = offer.update as Update;
	setState({ ...state, phase: "downloading", progress: null, message: null });
	let downloaded = 0;
	let total: number | null = null;
	try {
		await update.downloadAndInstall((event) => {
			if (event.event === "Started") {
				total = event.data.contentLength ?? null;
				downloaded = 0;
				setState({ ...getState(), progress: progressPercent(downloaded, total) });
			} else if (event.event === "Progress") {
				downloaded += event.data.chunkLength;
				setState({ ...getState(), progress: progressPercent(downloaded, total) });
			}
		});
		await deps.relaunch();
	} catch (error) {
		setState({
			...getState(),
			phase: "failed",
			message: error instanceof Error ? error.message : String(error),
			progress: null,
		});
	}
}

export async function releaseOffer(): Promise<void> {
	await closeHandle();
	setState({
		phase: "idle",
		offer: null,
		message: null,
		progress: null,
		dismissed: true,
	});
}
