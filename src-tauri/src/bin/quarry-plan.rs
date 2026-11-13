//! `quarry-plan <project root> [--release]`: the plan a project would run, as JSON.
//!
//! It exists for `scripts/cpp-parity-probe.ts`, which judges the product by running this output
//! instead of re-implementing its decisions. See `src/project_plan.rs` for what is asked and why.

use std::process::exit;

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(root) = args.next() else {
        eprintln!("usage: quarry-plan <project root> [--release]");
        exit(2);
    };
    let release = args.any(|flag| flag == "--release");
    let plan = match quarry_lib::project_plan::project_plan(&root, release) {
        Ok(plan) => plan,
        Err(error) => {
            eprintln!("quarry-plan: {error}");
            exit(1);
        }
    };
    match serde_json::to_string_pretty(&plan) {
        Ok(text) => println!("{text}"),
        Err(error) => {
            eprintln!("quarry-plan: {error}");
            exit(1);
        }
    }
}
