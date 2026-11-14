//! The test dock's answers as data instead of side effects.
//!
//! `scripts/parity-windows-tests.ts` measures the Windows test-runner row by asking what the
//! product's test tree would hold and what one case run reports. A probe that re-parsed
//! `--gtest_list_tests` output or rebuilt the `--gtest_filter` argv in TypeScript would measure
//! itself, so these two functions hand the dock's own commands through unchanged.
//!
//! `examples/quarry-tests.rs` prints the answers as JSON, the way `examples/quarry-plan.rs` prints
//! `project_plan` for the compiler probe.

pub use crate::types::{TestDiscovery, TestReport};

/// Every test the project offers, with one sentence per source that could not be read.
pub fn list_tests(root: &str) -> Result<TestDiscovery, String> {
    crate::test_task::discover(root)
}

/// One case's report; `Suite.Case` is a gtest case and anything else is a Cargo test, exactly as
/// the dock routes it.
pub fn run_test(root: &str, name: &str) -> Result<TestReport, String> {
    crate::test_task::run_case(root, name)
}
