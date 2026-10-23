import { useSyncExternalStore } from "react";
import type { Offer } from "@/lib/updates/model";

export type { Offer } from "@/lib/updates/model";

export type Phase = "idle" | "checking" | "current" | "available" | "downloading" | "failed";

export type State = {
	phase: Phase;
	offer: Offer | null;
	message: string | null;
	progress: number | null;
	dismissed: boolean;
};

const idle: State = {
	phase: "idle",
	offer: null,
	message: null,
	progress: null,
	dismissed: false,
};

let state: State = idle;
const listeners = new Set<() => void>();

export function getState(): State {
	return state;
}

/** Replaces the whole state; every field is explicit so a stale offer cannot survive a phase change. */
export function setState(next: State): void {
	state = next;
	for (const listener of listeners) listener();
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

/** Back to the launch state, used by tests and by a dismissal. */
export function resetState(): void {
	setState({ ...idle });
}
