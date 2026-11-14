//! `quarry-tests <project root> [--run <name>]`: the test dock's answers as JSON.
//!
//! It exists for `scripts/parity-windows-tests.ts`, which must judge the product's own GoogleTest
//! and Cargo discovery instead of parsing the same output a second time. The default prints
//! `{"discovery": …}`; `--run <name>` prints `{"report": …}`; a product error prints `{"error": …}`
//! on stdout with exit 1, so the probe can report the sentence the dock would show.

use std::process::exit;

use quarry_lib::test_plan::{list_tests, run_test};

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(root) = args.next() else {
        eprintln!("usage: quarry-tests <project root> [--run <name>]");
        exit(2);
    };
    let mut named: Option<String> = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--run" => match args.next() {
                Some(name) => named = Some(name),
                None => {
                    eprintln!("quarry-tests: --run needs a test name");
                    exit(2);
                }
            },
            other => {
                eprintln!("quarry-tests: unknown argument {other:?}");
                exit(2);
            }
        }
    }

    let answer = match named {
        Some(name) => run_test(&root, &name).map(|report| serde_json::json!({ "report": report })),
        None => list_tests(&root).map(|discovery| serde_json::json!({ "discovery": discovery })),
    };
    match answer {
        Ok(value) => println!("{value}"),
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            exit(1);
        }
    }
}
