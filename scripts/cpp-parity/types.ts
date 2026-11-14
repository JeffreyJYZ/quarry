/**
 * What `quarry-plan` answers, and the shapes the probe judges it in.
 *
 * The plan is the product's own output, printed by `src-tauri/examples/quarry-plan.rs` from the
 * same functions the app runs: presets, the detected build root, the toolchain file, the target a
 * Run would launch and the arguments clangd is started with are the product's decisions, not this
 * probe's.
 */

/** What `quarry-plan` prints: the product's own answer, one section per consumer. */
export interface Plan {
	kind: string;
	root: string;
	name: string;
	buildRoot: string;
	cmake: CmakeSection | null;
	plain: PlainSection | null;
	targets: Target[];
	handoff: Handoff | null;
}

/** The build quarry runs itself for a project with no build system. */
export interface PlainSection {
	/** The commands in the order the build runs them: one per compiler, then the link. */
	commands?: PlainCommand[];
	/** The single command an older planner reported, read so its rows stay measurable. */
	program?: string | null;
	argv?: string[];
	cwd?: string;
	note: string | null;
}

/** One command a plain build runs; `program` is the resolved path the product would spawn. */
export interface PlainCommand {
	program: string | null;
	argv: string[];
	cwd: string;
}

export interface CmakeSection {
	program: string | null;
	options: { preset: string; buildDir: string; toolchainFile: string };
	/** The profile the plan was asked for, in the spelling the settings file uses. */
	profile: string;
	/** The one target the plan names, or null when it builds everything. */
	target: string | null;
	buildRoot: string;
	cwd: string;
	configure: string[];
	build: string[];
	note: string | null;
}

interface Target {
	id: string;
	label: string;
	kind: string;
	target: string;
	program: string | null;
	error: string | null;
}

interface Handoff {
	server: string;
	args: string[];
	databaseDir: string | null;
	/** Why the start had to configure the tree, when it did. */
	note: string | null;
}

/** One probe's answer from one clangd session. */
export interface Measurement {
	hover: string | null;
	diagnostics: string[];
}

/** `PASS`/`FAIL` are measured; `n/a` is a consumer the row does not exercise. */
export type Verdict = "PASS" | "FAIL" | "SKIP" | "n/a";

export interface Row {
	capability: string;
	build: Verdict;
	analysis: Verdict;
	targets: Verdict;
	/** The trees the product created beside the plan's own: a fallback tree is not a capability. */
	tree: Verdict;
	details: string[];
	/** Every command the row ran, with what it proved. */
	commands: { line: string; verdict: Verdict }[];
}

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}
