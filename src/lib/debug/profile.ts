export type BuildProfile = "debug" | "release";

/** Pure decision helpers for debug launches driven by the selected build profile. */

export type DebugBuildResult = {
	success: boolean;
	artifact?: string | null;
};

/**
 * Which binary the debugger launches with, as an override. A release build must hand over the
 * artefact the build reported; a missing one is a hard failure rather than a stale debug binary.
 * The debug profile keeps the configured program when the build reports no artefact.
 */
export function resolveDebugArtifact(
	result: DebugBuildResult,
	profile: BuildProfile,
): { ok: true; program: string | null } | { ok: false; error: string } {
	const artifact = result.artifact ?? null;
	if (artifact !== null && artifact !== "") {
		return { ok: true, program: artifact };
	}
	if (profile === "debug") {
		return { ok: true, program: null };
	}
	return { ok: false, error: `Build succeeded but the ${profile} binary is missing` };
}

/** Message shown when the build profile changes while a debug session is live. */
export function liveSessionProfileMismatch(
	launched: BuildProfile | null,
	current: BuildProfile,
	sessionLive: boolean,
): string | null {
	if (!sessionLive || launched === null || launched === current) {
		return null;
	}
	return `Build profile changed to ${current} while a ${launched} debug session is live`;
}
