#!/usr/bin/env bun
/**
 * What the product's own plan and tree say about a second toolchain, as report lines and findings.
 *
 * The three facts are one report section because they fail together: a tree that was not configured
 * with GCC cannot have a database naming it, and a hand-off can only query a driver the database or
 * the cache names. Read out of the files themselves, so the row measures the product's decisions
 * rather than a copy of them.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import type { GccToolchain } from "./gcc";
import type { Plan } from "./types";

/** Whether two paths name the same file, whichever of Homebrew's two spellings CMake kept. */
export function samePath(one: string, other: string): boolean {
	try {
		return realpathSync(one) === realpathSync(other);
	} catch {
		return one === other;
	}
}

/**
 * The compiler a configured tree records, and the file that says so.
 *
 * A toolchain file sets the compiler before CMake's `project()` runs, and the cache then keeps only
 * the ar and ranlib tools that compiler comes with — so CMake's own compiler record is where a
 * toolchain-selected compiler lives, while a `-DCMAKE_CXX_COMPILER` configure keeps it in the cache.
 */
export function recordedCompiler(
	tree: string,
	language: "C" | "CXX",
): { path: string; file: string } | null {
	const key = `CMAKE_${language}_COMPILER`;
	const cache = join(tree, "CMakeCache.txt");
	const cached = existsSync(cache) ? readFileSync(cache, "utf8").split("\n") : [];
	const line = cached.find((row) => row.startsWith(`${key}:`));
	const value = line === undefined ? "" : (line.split("=")[1] ?? "").trim();
	if (value !== "") return { path: value, file: "CMakeCache.txt" };
	let versions: string[] = [];
	try {
		versions = readdirSync(join(tree, "CMakeFiles")).filter((entry) => /^\d/.test(entry));
	} catch {
		return null;
	}
	for (const version of versions) {
		const file = `CMakeFiles/${version}/CMake${language}Compiler.cmake`;
		if (!existsSync(join(tree, file))) continue;
		const text = readFileSync(join(tree, file), "utf8");
		const declaration = text.split("\n").find((row) => row.startsWith(`set(${key} "`));
		const quoted = declaration === undefined ? null : /"([^"]+)"/.exec(declaration);
		if (quoted?.[1] !== undefined) return { path: quoted[1], file };
	}
	return null;
}

/** One report section: whether it held, and the lines it wrote. */
export interface Evidence {
	ok: boolean;
	details: string[];
	findings: string[];
}

/**
 * The compiler the tree means, and whether it is the toolchain the fixture wrote into it.
 *
 * The tree is CMake's own record, not the database: a database entry may be a launcher, while the
 * compiler CMake configured with is the one whose headers the analysis must be taught to find. A
 * fixture configured behind a launcher records the launcher, which is what `launcher` says here.
 */
export function treeEvidence(
	tree: string,
	gcc: GccToolchain,
	root: string,
	launcher: string | null = null,
): Evidence {
	const directory = basename(root);
	const shown = tree.replace(`${root}/`, "");
	const cxx = recordedCompiler(tree, "CXX");
	const cc = recordedCompiler(tree, "C");
	const wantedCxx = launcher ?? gcc.cxx;
	const wantedCc = launcher ?? gcc.cc;
	const ok =
		cxx !== null && cc !== null && samePath(cxx.path, wantedCxx) && samePath(cc.path, wantedCc);
	const record =
		cxx === null
			? "no compiler recorded"
			: `${cxx.file} records CMAKE_CXX_COMPILER=${cxx.path}${cc === null ? "" : ` and CMAKE_C_COMPILER=${cc.path}`}`;
	return {
		ok,
		details: [`tree         ${ok ? "PASS" : "FAIL"}  ${record}`],
		findings: ok
			? []
			: [
					`${directory}: the configure must use ${wantedCxx} and ${wantedCc}, but the tree at ${shown} records ${cxx?.path ?? "no C++ compiler"} and ${cc?.path ?? "no C compiler"} — \`cd ${directory} && rg CMAKE_CXX_COMPILER ${shown}/CMakeFiles\`.`,
				],
	};
}

/** Whether each fixture unit was compiled by the driver of its own language, and by this GCC. */
export function databaseEvidence(
	tree: string,
	gcc: GccToolchain,
	root: string,
	read: (database: string, source: string) => string[] | null,
	launcher: string | null = null,
): Evidence {
	const directory = basename(root);
	const shown = tree.replace(`${root}/`, "");
	const database = join(tree, "compile_commands.json");
	const cxx = read(database, "main.cpp");
	const c = read(database, "value.c");
	const okCxx = compilesWith(cxx, gcc.cxx, launcher);
	const okC = compilesWith(c, gcc.cc, launcher);
	const spilled = [...(cxx ?? []), ...(c ?? [])].some((arg) => basename(arg).startsWith("clang"));
	const ok = okCxx && okC && !spilled;
	const cxxDriver = basename(cxx?.[0] ?? "");
	const cDriver = basename(c?.[0] ?? "");
	const wording =
		launcher === null
			? `the compile database must name GCC's own drivers, but main.cpp is compiled by ${cxxDriver} and value.c by ${cDriver}`
			: `the compile database must run ${basename(launcher)} in front of GCC's own drivers, but main.cpp is compiled by ${[cxxDriver, basename(cxx?.[1] ?? "")].join(" ")}, value.c by ${[cDriver, basename(c?.[1] ?? "")].join(" ")}`;
	return {
		ok,
		details: [
			`database     ${ok ? "PASS" : "FAIL"}  main.cpp is ${cxxDriver}, value.c is ${cDriver}`,
		],
		findings: ok
			? []
			: [
					`${directory}: ${wording} — \`cd ${directory} && rg -o '"command": "[^ ]*' ${shown}/compile_commands.json\`.`,
				],
	};
}

/** Whether one command names `compiler`, behind `launcher` when the tree has one. */
function compilesWith(
	command: string[] | null,
	compiler: string,
	launcher: string | null,
): boolean {
	if (command === null) return false;
	if (launcher === null) return samePath(command[0] ?? "", compiler);
	return samePath(command[0] ?? "", launcher) && samePath(command[1] ?? "", compiler);
}

/** Whether the hand-off tells clangd to query the drivers it cannot recognise, and the tree it wrote. */
export function handoffEvidence(
	tree: string,
	gcc: GccToolchain,
	plan: Plan,
	root: string,
): Evidence {
	const directory = basename(root);
	const shown = tree.replace(`${root}/`, "");
	const args = plan.handoff?.args ?? [];
	const flag = args.find((arg) => arg.startsWith("--query-driver="));
	const listed = flag === undefined ? [] : (flag.split("=")[1] ?? "").split(",").filter(Boolean);
	const queries =
		listed.some((path) => samePath(path, gcc.cxx)) &&
		listed.some((path) => samePath(path, gcc.cc));
	const clangNamed = listed.some((path) => basename(path).startsWith("clang"));
	const database = plan.handoff?.databaseDir ?? null;
	const readsTree = database === tree;
	const ok = queries && !clangNamed && readsTree;
	const where = database === null ? "unset" : database.replace(`${root}/`, "");
	return {
		ok,
		details: [
			`handoff      ${ok ? "PASS" : "FAIL"}  --query-driver ${listed.length === 0 ? "is absent" : `names ${listed.join(", ")}`}, database ${where}`,
		],
		findings: ok
			? []
			: [
					`${directory}: the hand-off must tell clangd to query ${gcc.cxx} and ${gcc.cc} for their include paths and read ${shown}, but \`cd ${directory} && quarry-plan .\` names ${flag ?? "no --query-driver"} and database ${where}. clangd recognises clang by name, so without the query it reads the platform's headers instead of GCC's.`,
				],
	};
}
