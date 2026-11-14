/**
 * What the Rust source still says, so the seam cannot silently drift away from the product's path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = join(import.meta.dir, "..", "..", "src-tauri", "src");

/**
 * Each line is the call the product makes into the function the seam reports: if one moves, the
 * probe must be retargeted rather than keep measuring a decision nothing runs.
 */
export function seamFacts(): string[] {
	const read = (path: string) => readFileSync(join(SOURCE, path), "utf8");
	const facts: string[] = [];
	const build = read("build_task/absolute_path.rs");
	if (
		!build.includes(
			"cmake_plan_target(source, profile, &CmakeOptions::for_root(source), target)",
		)
	) {
		facts.push("run_cmake_build no longer asks cmake_plan_target for its build and target");
	}
	if (!build.includes("configure_tree(")) {
		facts.push("run_cmake_build no longer configures through the shared configure sequence");
	}
	if (!build.includes("run_cmake(state, argv, source_root)")) {
		facts.push("run_cmake_build no longer runs the plan's configure argv");
	}
	if (!build.includes("run_cmake(state, &plan.build, source_root)")) {
		facts.push("run_cmake_build no longer runs plan.build");
	}
	const dispatch = read("build_task/default_cargo.rs");
	if (!dispatch.includes("run_cmake_build(state, &info.root, profile, target)")) {
		facts.push("build_project no longer passes the profile and target to the CMake build");
	}
	const profiles = read("build_task/profile.rs");
	if (!profiles.includes('"relwithdebinfo"') || !profiles.includes('"minsizerel"')) {
		facts.push("the build profile no longer names CLion's four configurations");
	}
	const model = read("build_task/cmake_model/configure.rs");
	if (!model.includes("write_query(request.build_root)")) {
		facts.push("the shared configure no longer writes the file API query before configuring");
	}
	if (!model.includes("synthesize_database(request.build_root, request.configuration)")) {
		facts.push(
			"the shared configure no longer synthesises the database for the configuration it built",
		);
	}
	const handoff = read("lsp/handoff/configure.rs");
	if (!handoff.includes("configure_tree(request")) {
		facts.push("the hand-off no longer configures through the shared configure sequence");
	}
	if (!handoff.includes("synthesize_database(&plan.build_root, &plan.configuration)")) {
		facts.push("the hand-off no longer derives the database for the profile's configuration");
	}
	if (!handoff.includes("configure_need(root, &plan.build_root")) {
		facts.push("the hand-off no longer asks the model whether the tree is current");
	}
	const database = read("lsp/handoff/database.rs");
	if (!database.includes("ensure_database(root, &plan)")) {
		facts.push("the hand-off no longer takes its database directory from the plan");
	}
	if (!database.includes("cmake_database(root, profile)")) {
		facts.push("the hand-off no longer configures the tree for the build profile");
	}
	if (!database.includes("plain_database(root)")) {
		facts.push("the hand-off no longer synthesises a database for a plain project");
	}
	const plain = read("build_task/run_plain_clang.rs");
	if (!plain.includes("let flags = build_flags(root_path, &sources);")) {
		facts.push("the plain build no longer derives its flags from the project");
	}
	if (!plain.includes("synthesize_plain_database(root_path, &sources)")) {
		facts.push("the plain build no longer writes the database it analyses with");
	}
	const session = read("lsp/start_session.rs");
	if (!session.includes("server_args(server, &info, &overrides.args, overrides.profile)")) {
		facts.push(
			"start_session no longer composes the server arguments with the profile in effect",
		);
	}
	if (!session.includes("command.args(&handoff.args)")) {
		facts.push("start_session no longer spawns the server with the composed arguments");
	}
	const commands = read("launch/targets/commands.rs");
	if (!commands.includes("list_targets(&root)")) {
		facts.push("list_run_targets no longer calls list_targets");
	}
	if (!commands.includes("resolve_target(&root, &id, stop_on_entry)")) {
		facts.push("resolve_run_target no longer calls resolve_target");
	}
	return facts;
}
