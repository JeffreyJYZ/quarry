import type { Update } from "@tauri-apps/plugin-updater";
import { getDeps } from "@/lib/updates/deps";
import { type Offer, isNewer, progressPercent } from "@/lib/updates/model";
import { getState, setState } from "@/lib/updates/state";

export type { Offer, Phase, State } from "@/lib/updates/state";
export { isNewer, offerClause, offerHeadline, progressPercent } from "@/lib/updates/model";
export { resetUpdateDeps, setUpdateDeps } from "@/lib/updates/deps";
export { getState, subscribe, useUpdates } from "@/lib/updates/state";
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
	const state = getState();
	if (state.phase === "checking" || state.phase === "downloading") {
		return;
	}
	await closeHandle();
	setState({
		phase: "checking",
		offer: null,
		message: null,
		progress: null,
	});
	let offer: Offer | null = null;
	let version: string | null = null;
	try {
		const deps = getDeps();
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
				version = updater.version;
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
	if (offer === null) {
		setState({
			phase: "current",
			offer: null,
			message: null,
			progress: null,
		});
		return;
	}
	if (offer.kind === "github") {
		setState({
			phase: "current",
			offer,
			message: null,
			progress: null,
		});
		return;
	}
	// updater offer: download automatically
	setState({
		phase: "downloading",
		offer,
		message: null,
		progress: null,
	});
	const update = offer.update as Update;
	let downloaded = 0;
	let total: number | null = null;
	try {
		await update.download((event) => {
			if (event.event === "Started") {
				total = event.data.contentLength ?? null;
				downloaded = 0;
				setState({ ...getState(), progress: progressPercent(downloaded, total) });
			} else if (event.event === "Progress") {
				downloaded += event.data.chunkLength;
				setState({ ...getState(), progress: progressPercent(downloaded, total) });
			}
		});
		setState({
			phase: "ready",
			offer,
			message: null,
			progress: progressPercent(downloaded, total),
		});
	} catch (error) {
		setState({
			phase: "failed",
			offer: null,
			message: error instanceof Error ? error.message : String(error),
			progress: null,
		});
	}
	void version;
}

export async function restartWithUpdate(): Promise<void> {
	const state = getState();
	const offer = state.offer;
	if (offer !== null && offer.kind === "updater") {
		const update = offer.update as { install?: (options?: unknown) => Promise<void> };
		if (typeof update.install === "function") {
			try {
				await update.install();
			} catch (error) {
				setState({
					...getState(),
					phase: "failed",
					message: error instanceof Error ? error.message : String(error),
					progress: null,
				});
				return;
			}
		}
	}
	await getDeps().relaunch();
}

/** @deprecated use restartWithUpdate */
export async function installNow(): Promise<void> {
	await restartWithUpdate();
}

export async function releaseOffer(): Promise<void> {
	await closeHandle();
	setState({
		phase: "idle",
		offer: null,
		message: null,
		progress: null,
	});
}
