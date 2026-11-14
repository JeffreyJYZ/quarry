import type { Diagnostic, LaunchConfig } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { LaunchFailure } from "@/lib/run/failureLines";
import type { BuildProfile } from "@/lib/settings/model";

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
 * compiler error goes instead of resolving a path the build never wrote. The run form's hand-set
 * program, when it is one the user can launch, is the one exception, and the caller passes it in.
 */
export const NO_EXECUTABLE =
	"the build succeeded but produced no executable to run: set the program in the run form";

/**
 * Shown when the only program available is the run form's, and it is not a file.
 *
 * The build result and the manual field are both empty of anything launchable, so this names the
 * field the message points at and the exact path it held: a typo is readable, not guessed at.
 */
export function manualProgramMissing(program: string): string {
	return `the build produced no executable to run and the run form's program does not exist: ${program}`;
}

/**
 * The run form's configuration, used only when a build names no executable.
 *
 * `exists` answers whether the path is a file this machine can launch; the form is free text, so a
 * path that was deleted since it was typed must be reported instead of handed to the launcher.
 */
export type ManualFallback = {
	config: LaunchConfig;
	exists: (program: string) => Promise<boolean>;
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
 * A successful build's `artifact` replaces the resolved `program`, because the binary the build just
 * wrote is the one to launch. A build that reports none leaves the run form's hand-set program as
 * the only candidate, and that is a fallback and nothing more: the build's answer still wins, so a
 * stale binary is never launched after a build that wrote something else.
 */
export async function buildThenResolve(options: {
	root: string;
	targetId: string;
	profile: BuildProfile;
	stopOnEntry: boolean;
	build: (
		root: string,
		profile: BuildProfile,
		target?: string | null,
	) => Promise<{
		success: boolean;
		summary: string;
		artifact?: string | null;
		diagnostics?: Diagnostic[];
	}>;
	resolve: (root: string, id: string, stopOnEntry: boolean) => Promise<LaunchConfig>;
	/** The run form's fields, or null when it holds no program. */
	fallback?: ManualFallback | null;
}): Promise<BuildThenResolveResult> {
	let report: BuildOutcome;
	try {
		// The run-target id names the one CMake target this launch will run, so the build before a
		// launch compiles that target instead of the whole tree. A Cargo id selects nothing there.
		report = await options.build(options.root, options.profile, options.targetId);
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
	if (artifact !== "") {
		let config: LaunchConfig;
		try {
			config = await options.resolve(options.root, options.targetId, options.stopOnEntry);
		} catch (error) {
			return { ok: false, stage: "resolve", message: describeError(error), diagnostics: [] };
		}
		return { ok: true, config: { ...config, program: artifact } };
	}
	const fallback = options.fallback ?? null;
	const manual = fallback?.config.program.trim() ?? "";
	if (fallback === null || manual === "") {
		return { ok: false, stage: "build", message: NO_EXECUTABLE, diagnostics: [] };
	}
	let exists = false;
	try {
		exists = await fallback.exists(manual);
	} catch {
		exists = false;
	}
	if (!exists) {
		return {
			ok: false,
			stage: "resolve",
			message: manualProgramMissing(manual),
			diagnostics: [],
		};
	}
	return { ok: true, config: { ...fallback.config, program: manual } };
}
