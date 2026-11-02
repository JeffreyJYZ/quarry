import type { Diagnostic, LaunchConfig } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { LaunchFailure } from "@/lib/run/failureLines";

/** What a build reports, narrowed to the part launching depends on. */
type BuildOutcome = {
	success: boolean;
	summary: string;
	artifact?: string | null;
	diagnostics?: Diagnostic[];
};

export type BuildThenResolveResult =
	{ ok: true; config: LaunchConfig } | ({ ok: false } & LaunchFailure);

/**
 * Build, then resolve the target — the one sequence Run and Debug share.
 *
 * Both buttons must do exactly this in this order: a fresh checkout has no binary to describe until
 * cargo or the C/C++ build has written one, so resolving first would hand the adapter a path that
 * does not exist. Keeping the order in one place is what stops the two paths drifting apart.
 *
 * A failed build hands back its diagnostics as well as its summary. The summary is one line, and the
 * exact message — file, position, the compiler's own words — is only in the diagnostics; dropping
 * them is why a run used to fail with a bare "Build failed" and nothing to read.
 *
 * A successful build's `artifact` replaces the resolved `program`, because the binary cargo just
 * wrote is the one to launch; a build that reports none (a library, a text-only build) leaves the
 * resolved path alone.
 */
export async function buildThenResolve(options: {
	root: string;
	targetId: string;
	profile: "debug" | "release";
	stopOnEntry: boolean;
	build: (
		root: string,
		profile: "debug" | "release",
	) => Promise<{
		success: boolean;
		summary: string;
		artifact?: string | null;
		diagnostics?: Diagnostic[];
	}>;
	resolve: (root: string, id: string, stopOnEntry: boolean) => Promise<LaunchConfig>;
}): Promise<BuildThenResolveResult> {
	let report: BuildOutcome;
	try {
		report = await options.build(options.root, options.profile);
	} catch (error) {
		return { ok: false, stage: "build", message: describeError(error), diagnostics: [] };
	}
	if (!report.success) {
		return {
			ok: false,
			stage: "build",
			message: report.summary,
			diagnostics: report.diagnostics ?? [],
		};
	}
	let config: LaunchConfig;
	try {
		config = await options.resolve(options.root, options.targetId, options.stopOnEntry);
	} catch (error) {
		return { ok: false, stage: "resolve", message: describeError(error), diagnostics: [] };
	}
	const artifact = report.artifact?.trim() ?? "";
	if (artifact === "") {
		return { ok: true, config };
	}
	return { ok: true, config: { ...config, program: artifact } };
}
