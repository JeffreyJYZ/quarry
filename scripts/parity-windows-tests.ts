#!/usr/bin/env bun
/**
 * The test-runner row: what the test dock must do on the platforms CLion's users build on.
 *
 * CLion's parity here is two things a user sees: the test tree is populated from the project's own
 * runner, and a case can be executed from the gutter. quarry's dock does that for a Cargo project by
 * building the test targets with `cargo test --no-run --message-format=json` and asking each built
 * executable for `--list --format terse`, and for a C/C++ project whose `.quarry/launch.json` names
 * a program with `<program> --gtest_list_tests` plus `<program> --gtest_filter=Suite.Case`. This row
 * builds both projects, asks the product through `examples/quarry-tests.rs` — so the parse, argv and
 * exit handling judged are quarry's, not this script's — and prints PASS/FAIL per capability.
 *
 * The two modes measure the same assertions over the trees each platform actually writes:
 *
 *   (default)  Windows. The gtest program is the `<Config>\<name>.exe` a Visual Studio generator
 *              writes, `--config Debug` is what puts it there, and the Cargo project builds with
 *              MSVC. `--windows` names this mode explicitly.
 *   --linux    Linux. A single-config generator writes `build/parity_gtest` with no `.exe` and no
 *              configuration directory at all, so no `--config` is passed and the row asserts the
 *              artefact sits straight in `build/`; the Cargo fixture's test binary is asserted under
 *              `target/debug/deps/`.
 *
 * The image ships no gtest package, so the fixture vendors a GoogleTest-shaped runner
 * (`scripts/windows-tests/fixtures.ts` explains why that measures the dock and not GoogleTest).
 *
 * A row that cannot run says so by name. On a machine that is not Windows the default mode prints
 * one SKIP line with the reason and exits 0; on Windows `--linux` does the same, and so does a
 * missing Visual Studio generator, cmake, cargo or C++ toolchain. A fixture or seam defect exits 2,
 * a product finding exits 1, and every failure quotes the exact command with its exit code and first
 * stderr lines.
 *
 * Usage: bun scripts/parity-windows-tests.ts [--windows|--linux]
 */

import { main } from "./windows-tests/modes";

try {
	process.exit(await main());
} catch (error) {
	console.log(
		`FAIL  test-runner row (probe defect: ${error instanceof Error ? error.message : String(error)})`,
	);
	process.exit(2);
}
