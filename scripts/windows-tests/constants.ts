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

/** The executable names, as a link on Windows names them. */
export const GTEST_PROGRAM = "parity_gtest.exe";
export const GTEST_HANG_PROGRAM = "parity_gtest_hang.exe";

/** The Cargo test the dock's `cargo test -- --list --format terse` run must name. */
export const CARGO_TEST = "adds_two_and_three";
