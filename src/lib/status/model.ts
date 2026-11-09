/**
 * What the bottom bar says is happening, decided in one place.
 *
 * Every surface here describes work that is happening *now*. A build that was cancelled and a server
 * that ended describe nothing, so they must not leave a label behind — a chip still saying "indexing"
 * after its server exited is the defect this module exists to prevent. The decision is pure so the
 * wrong combinations are tests, and the shell only feeds it live state.
 */

import type { ServerKind } from "@/lib/lsp/served";
import type { LspStatus } from "@/lib/project/api";

/** One server's state. `absent` is an answer (this root runs no such server), not "not known yet". */
export type ServerState =
	| { phase: "absent" }
	| { phase: "starting" }
	| { phase: "ready"; status: LspStatus }
	| { phase: "ended" };

/** Both kinds are always present: a disabled server is `absent`, never a missing entry. */
export type ServerStates = Record<ServerKind, ServerState>;

export type ServerSurface = {
	phase: ServerState["phase"];
	/** The server's name once it is ready; null otherwise. */
	name: string | null;
};

const ABSENT_SURFACE: ServerSurface = { phase: "absent", name: null };

/** The chip's view of one server, from the map the session hook keeps. */
export function serverSurface(kind: ServerKind | null, states: ServerStates): ServerSurface {
	if (kind === null) return ABSENT_SURFACE;
	const state = states[kind];
	if (state.phase === "ready") return { phase: "ready", name: state.status.server };
	if (state.phase === "starting") return { phase: "starting", name: null };
	if (state.phase === "ended") return { phase: "ended", name: null };
	return ABSENT_SURFACE;
}

export type StatusInput = {
	server: ServerSurface;
	/** True only while a build is in flight; a finished, failed or cancelled build is not building. */
	building: boolean;
	/** True only while a process or debug session is live. */
	running: boolean;
};

export type StatusChip = { label: string; title: string };

/**
 * The one decision for the bottom bar's chip, in precedence order: the foreground action first, then
 * the server's own work, then the session, then the server's name once everything is quiet.
 *
 * An `ended` server is named as unavailable rather than hidden: the connection is gone, and this is
 * the one surface that says so until a restart brings it back.
 */
export function statusChip(input: StatusInput): StatusChip | null {
	if (input.building) return { label: "building", title: "Build in progress" };
	if (input.server.phase === "starting") {
		return { label: "lsp starting", title: "Language server starting" };
	}
	if (input.running) return { label: "running", title: "A process is running" };
	if (input.server.phase === "ready") {
		return input.server.name === null
			? null
			: { label: input.server.name, title: "Language server" };
	}
	if (input.server.phase === "ended") {
		return { label: "lsp unavailable", title: "Language server stopped" };
	}
	return null;
}
