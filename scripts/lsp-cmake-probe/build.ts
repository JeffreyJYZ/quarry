/**
 * Configuring and building the fixture, then reading the compile database back.
 *
 * `cmake --build` runs first on purpose: code the build rejects is not the case being proven, so a
 * broken fixture must fail as a fixture, not as a clangd result.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface BuildFacts {
	buildDir: string;
	database: string;
	compiler: string;
}

export function buildProject(project: string): BuildFacts {
	const build = join(project, "cmake-build-debug");
	const configured = spawnSync(
		"cmake",
		[
			"-S",
			project,
			"-B",
			build,
			"-DCMAKE_BUILD_TYPE=Debug",
			"-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
		],
		{ encoding: "utf8" },
	);
	if (configured.status !== 0) {
		throw new Error(`cmake configure failed: ${(configured.stderr ?? "").trim()}`);
	}
	const built = spawnSync("cmake", ["--build", build], { encoding: "utf8" });
	if (built.status !== 0) {
		throw new Error(`the project does not build: ${(built.stderr ?? "").trim()}`);
	}

	const database = join(build, "compile_commands.json");
	if (!existsSync(database)) throw new Error(`no compile database at ${database}`);
	const entries = JSON.parse(readFileSync(database, "utf8")) as {
		arguments?: string[];
		command?: string;
	}[];
	const first = entries[0];
	const compiler = first?.arguments?.[0] ?? first?.command?.split(" ")[0] ?? "";
	if (compiler === "") throw new Error("the database names no compiler");
	return { buildDir: build, database, compiler };
}
