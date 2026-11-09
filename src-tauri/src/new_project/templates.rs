#![allow(unused_imports)]

//! The starter files a new project is created from.
//!
//! They live here rather than inline in `create_project` because they are content the user reads,
//! edits and judges — the first thing a new project shows. Keeping them in one place means a change
//! to the house style is one edit, and the tests can assert the whole file instead of a fragment of a
//! format string.
//!
//! `{name}` is the project name; substitute it with [`with_name`].

use super::*;

/// Rust binary entry point.
pub const RUST_MAIN: &str = "fn main() {\n    println!(\"Hello from {name}\");\n}\n";

/// Rust library with one tested function, so `cargo test` has something to run immediately.
pub const RUST_LIB: &str = "pub fn add(a: usize, b: usize) -> usize {\n    a + b\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn it_works() {\n        assert_eq!(add(2, 2), 4);\n    }\n}\n";

/// C entry point: `stdio` and `printf`, because a C file has nowhere to put a `using` line.
pub const C_MAIN: &str = "#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello from {name}\\n\");\n    return 0;\n}\n";

/// C++ entry point: the standard library with `using namespace std;`, so the first program reads like
/// the code a course or a book shows rather than a qualified `std::cout`.
pub const CPP_MAIN: &str = "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello from {name}\" << endl;\n    return 0;\n}\n";

/// Build directory of a Cargo project.
pub const GITIGNORE_TARGET: &str = "/target\n";

/// Build directory of a CMake project.
pub const GITIGNORE_BUILD: &str = "/build\n";

/// A template with the project name filled in.
pub fn with_name(template: &str, name: &str) -> String {
    template.replace("{name}", name)
}
