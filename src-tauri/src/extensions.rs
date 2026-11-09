//! Which extensions are C or C++, in one place for the crate.
//!
//! `src/lib/consts/extensions.ts` is the app's documented table, and this is its Rust mirror: the
//! formatter, the language ids and the plain-clang collector all read it here, so a table known to
//! the editor cannot be invisible to the build. `matches_the_documented_set` parses that file, so
//! the two lists cannot drift in silence.

use std::path::Path;

/// Every C/C++ source and header extension, without the leading dot.
pub const CPP_EXTENSIONS: [&str; 8] = ["c", "h", "cc", "cpp", "cxx", "hh", "hpp", "hxx"];

/// The extensions clang can compile; a header is consumed by the compiler, never passed to it.
pub const CPP_SOURCE_EXTENSIONS: [&str; 4] = ["c", "cc", "cpp", "cxx"];

/// The extension lowercased and without its dot, or `""` when there is none.
pub fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// Whether a path is a C/C++ source, which is what a plain-clang build compiles.
pub fn is_cpp_source(path: &Path) -> bool {
    CPP_SOURCE_EXTENSIONS.contains(&extension_of(path).as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend table is the documented set; read it rather than repeating the names here.
    fn documented_extensions() -> Vec<&'static str> {
        let source = include_str!("../../src/lib/consts/extensions.ts");
        let declaration = source
            .find("CPP_EXTENSIONS")
            .expect("src/lib/consts/extensions.ts no longer declares CPP_EXTENSIONS");
        let rest = &source[declaration..];
        let open = rest.find('[').expect("CPP_EXTENSIONS has no array");
        let close = rest
            .find(']')
            .expect("CPP_EXTENSIONS has no closing bracket");
        rest[open + 1..close]
            .split(',')
            .map(|entry| entry.trim().trim_matches('"'))
            .filter(|entry| !entry.is_empty())
            .collect()
    }

    #[test]
    fn matches_the_documented_set() {
        assert_eq!(
            documented_extensions(),
            CPP_EXTENSIONS.to_vec(),
            "the Rust table drifted from src/lib/consts/extensions.ts"
        );
    }

    #[test]
    fn every_compilable_extension_is_a_documented_one() {
        for extension in CPP_SOURCE_EXTENSIONS {
            assert!(
                CPP_EXTENSIONS.contains(&extension),
                "{extension} is compiled but not documented"
            );
        }
    }

    #[test]
    fn case_and_missing_extension_do_not_decide() {
        assert!(is_cpp_source(Path::new("a/b/MAIN.CXX")));
        assert!(is_cpp_source(Path::new("main.c")));
        assert!(!is_cpp_source(Path::new("main.hpp")));
        assert!(!is_cpp_source(Path::new("main")));
    }
}
