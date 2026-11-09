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

/**
 * Shown when a build succeeds without naming an executable.
 *
 * It is a result of the build, not a failure to launch, so it is reported in the same place a
 * compiler error goes instead of resolving a path the build never wrote.
 */
export const NO_EXECUTABLE =
	"the build succeeded but produced no executable to run: set the program in the run form";

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
 * A successful build's `artifact` replaces the resolved `program`, because the binary the build just
 * wrote is the one to launch. A build that reports none produced nothing to run, and that is
 * reported here: falling back to the resolved path launches whatever an earlier build left there,
 * which is why Run used to start a stale binary after a build that wrote nothing.
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
	const artifact = report.artifact?.trim() ?? "";
	if (artifact === "") {
		return { ok: false, stage: "build", message: NO_EXECUTABLE, diagnostics: [] };
	}
	let config: LaunchConfig;
	try {
		config = await options.resolve(options.root, options.targetId, options.stopOnEntry);
	} catch (error) {
		return { ok: false, stage: "resolve", message: describeError(error), diagnostics: [] };
	}
	return { ok: true, config: { ...config, program: artifact } };
}
