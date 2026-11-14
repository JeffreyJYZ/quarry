/**
 * Laying a fixture out on disk: its files, its launchers, and the CMake file API query a CLion-
 * shaped build directory carries before it is configured.
 */

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Fixture } from "./fixtures/types";

/** The file API objects a CLion-grade CMake project asks for, written by the probe's own build. */
const QUERY_BODY = JSON.stringify(
	{
		requests: [
			{ kind: "codemodel", version: { major: 2 } },
			{ kind: "toolchains", version: { major: 1 } },
			{ kind: "cmakeFiles", version: { major: 1 } },
		],
	},
	null,
	2,
);

/**
 * Write the file API query into a build directory before CMake configures it.
 *
 * A CLion project's build directory carries one — CLion asks for the model, and so does quarry —
 * and the reply index it produces is the record of a finished configure. Without it every fixture
 * tree would read as never configured, and the probe could not tell "opening reconfigured a current
 * tree" from "opening produced the model this tree never had".
 */
export function writeQuery(root: string, buildDir: string) {
	const directory = join(root, buildDir, ".cmake", "api", "v1", "query", "client-parity");
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "query.json"), QUERY_BODY);
}

export function writeFixture(root: string, fixture: Fixture) {
	for (const [path, text] of Object.entries(fixture.files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
	// A launcher has to be runnable for CMake to use it as the compiler.
	for (const path of fixture.executables ?? []) chmodSync(join(root, path), 0o755);
}
