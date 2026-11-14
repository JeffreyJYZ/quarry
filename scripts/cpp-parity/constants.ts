/**
 * The probe's own budgets, in one place so a slow tool has one number to raise.
 */

/** How long a JSON-RPC answer from clangd may take. */
export const RESPONSE_TIMEOUT = 20_000;

/** clangd answers a one-file hover as soon as the file has parsed; this bounds the retry. */
export const HOVER_TIMEOUT = 1_500;

/** A configure or a build: bounded so a hung CMake cannot pin the probe. */
export const CMAKE_TIMEOUT = 180_000;

/** The planner is a cargo build, which may compile the crate from cold on a fresh runner. */
export const CARGO_TIMEOUT = 900_000;
