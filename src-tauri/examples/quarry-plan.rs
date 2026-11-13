//! `quarry-plan <project root> [--profile <name>] [--target <name>] [--release]`: the plan a
//! project would run, as JSON.
//!
//! It exists for `scripts/cpp-parity-probe.ts`, which judges the product by running this output
//! instead of re-implementing its decisions. See `src/project_plan.rs` for what is asked and why.

use std::process::exit;

use quarry_lib::project_plan::{BuildProfile, PlanRequest, project_plan};

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(root) = args.next() else {
        eprintln!(
            "usage: quarry-plan <project root> [--profile <name>] [--target <name>] [--release]"
        );
        exit(2);
    };
    let mut request = PlanRequest::default();
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--release" => request.profile = BuildProfile::Release,
            "--profile" => {
                let Some(value) = args.next() else {
                    eprintln!("quarry-plan: --profile needs a name");
                    exit(2);
                };
                request.profile = match BuildProfile::from_wire(&value) {
                    Ok(profile) => profile,
                    Err(error) => {
                        eprintln!("quarry-plan: {error}");
                        exit(2);
                    }
                };
            }
            "--target" => {
                let Some(value) = args.next() else {
                    eprintln!("quarry-plan: --target needs a name");
                    exit(2);
                };
                request.target = Some(value);
            }
            other => {
                eprintln!("quarry-plan: unknown argument {other:?}");
                exit(2);
            }
        }
    }
    let plan = match project_plan(&root, &request) {
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
