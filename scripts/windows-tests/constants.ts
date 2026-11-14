/**
 * The names the Windows test-runner row asserts, in one place.
 *
 * They are constants because the fixture's own source has to agree with them: the gtest case is
 * registered with these strings, and the row judges the dock against the same strings, so a rename
 * cannot leave the assertion testing the old name.
 */

/** The suite and case the tree must show, and the token only the case's body prints. */
export const GTEST_SUITE = "ParitySuite";
export const GTEST_CASE = "HoldsValues";
export const GTEST_NAME = `${GTEST_SUITE}.${GTEST_CASE}`;
/** The value the case computes, which its own output prints. */
export const CASE_VALUE = 5;
export const CASE_OUTPUT = `parity-case-output total=${CASE_VALUE}`;
/** A sibling case: its output appearing in a one-case run means the filter never reached the binary. */
export const OTHER_CASE = "OtherValues";
export const OTHER_OUTPUT = "parity-other-output";

/** The CMake targets: the file each writes is the platform's own name for it (`<target>` or `.exe`). */
export const GTEST_TARGET = "parity_gtest";
export const GTEST_HANG_TARGET = "parity_gtest_hang";

/** The Cargo test the dock's Cargo discovery must name. */
export const CARGO_TEST = "adds_two_and_three";

/**
 * The file that test lives in: the label the dock must show beside it, and never `src/lib.rs`.
 *
 * Cargo prints its `Running unittests src/lib.rs` header on stderr before the integration test's
 * name reaches stdout, so a single merged `--list` pass labels the case with whichever header won
 * the race. The row pins the honest label, not just the name.
 */
export const CARGO_TEST_SOURCE = "tests/parity.rs";
