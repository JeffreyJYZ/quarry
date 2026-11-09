import { type BuildReport, buildProject } from "@/lib/project/api";

/** How a build is asked for; the toolbar and a launch both hand it this signature. */
export type BuildCall = (root: string, profile: "debug" | "release") => Promise<BuildReport>;

/** Builds already running, keyed by the tree and profile they describe. */
const running = new Map<string, Promise<BuildReport>>();

/**
 * One build per tree and profile, however many callers ask for it at once.
 *
 * The toolbar's Build action, the Run and Debug launchers and the debugger's build offer each held
 * their own in-flight flag, so two of them could start `cargo build` on the same tree together:
 * one target directory with two writers, and whichever finished last decided the artifact. The
 * guard lives here, where every path meets, so a second caller joins the running build instead of
 * starting another one.
 */
export async function buildOnce(
	root: string,
	profile: "debug" | "release",
	build: BuildCall = buildProject,
): Promise<BuildReport> {
	const key = `${root}\u0000${profile}`;
	const started = running.get(key);
	if (started !== undefined) return started;

	const pending = build(root, profile).finally(() => {
		if (running.get(key) === pending) running.delete(key);
	});
	running.set(key, pending);
	return pending;
}

/** Forget every running build; a test calls this so one case cannot join another's build. */
export function resetBuildGate(): void {
	running.clear();
}
