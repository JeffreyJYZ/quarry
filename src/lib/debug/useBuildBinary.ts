import { useCallback } from "react";
import { buildProject } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { type BuildProfile, resolveDebugArtifact } from "@/lib/debug/profile";

type Setter<T> = (updater: T | ((current: T) => T)) => void;

/**
 * The one-build offer after a launch fails for a missing binary.
 *
 * A successful build retries the launch once with the artefact it produced; a failed one keeps the
 * offer so the user can fix the cause and press it again.
 */
export function useBuildBinary(options: {
	rootRef: { current: string | null };
	buildProfile: BuildProfile;
	buildNeeded: string | null;
	building: boolean;
	launch: (offerBuild?: boolean, programOverride?: string | null) => Promise<void>;
	setError: (message: string | null) => void;
	setBuilding: Setter<boolean>;
	setBuildNeeded: Setter<string | null>;
}) {
	const { rootRef, buildProfile, buildNeeded, building, launch } = options;

	return useCallback(async () => {
		const rootNow = rootRef.current;
		const message = buildNeeded;
		if (rootNow === null || building || message === null) return;
		options.setBuilding(true);
		options.setBuildNeeded(null);
		options.setError(null);
		let program: string | null = null;
		try {
			const report = await buildProject(rootNow, buildProfile);
			if (!report.success) {
				options.setError(`Build: ${report.summary}`);
				options.setBuildNeeded(message);
				return;
			}
			const target = resolveDebugArtifact(report, buildProfile);
			if (!target.ok) {
				options.setError(target.error);
				return;
			}
			program = target.program;
		} catch (reason) {
			options.setError(`Build: ${describeError(reason)}`);
			options.setBuildNeeded(message);
			return;
		} finally {
			options.setBuilding(false);
		}
		await launch(false, program);
	}, [rootRef, buildProfile, buildNeeded, building, launch, options]);
}
