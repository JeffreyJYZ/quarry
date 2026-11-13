#![allow(unused_imports)]

pub use std::path::PathBuf;

use super::*;

/// A build's argv is read by cmake, MSBuild and CL, none of which accepts a canonical Windows path.
///
/// The plan's paths are canonical internally; every one that becomes an argument goes through
/// `external` first, and this pins that for all three argv shapes at once.
#[cfg(test)]
#[allow(dead_code)]
pub mod verbatim_tests {
    use super::*;

    const SOURCE: &str = r"\\?\C:\work\parity\proj";
    const BUILD: &str = r"\\?\C:\work\parity\proj\build";
    const TOOLCHAIN: &str = r"\\?\C:\work\parity\tc.cmake";

    fn no_marker(argv: &[String]) {
        for argument in argv {
            assert!(
                !argument.contains(r"\\?\"),
                "{argument:?} would be handed to another program: {argv:?}"
            );
        }
    }

    #[test]
    fn a_configure_names_the_plain_paths() {
        let argv = cmake_configure_argv_with(SOURCE, BUILD, Some("Debug"));

        no_marker(&argv);
        assert!(
            argv.windows(2)
                .any(|pair| pair[0] == "-S" && pair[1] == r"C:\work\parity\proj"),
            "{argv:?}"
        );
        assert!(
            argv.windows(2)
                .any(|pair| pair[0] == "-B" && pair[1] == r"C:\work\parity\proj\build"),
            "{argv:?}"
        );
    }

    #[test]
    fn a_build_and_a_preset_configure_name_the_plain_paths() {
        let build = cmake_build_argv(BUILD, BuildProfile::Release, Some("parity_vs"));
        let preset = preset_configure_argv("debug", SOURCE, BUILD, None, true, Some(TOOLCHAIN));

        no_marker(&build);
        no_marker(&preset);
        assert!(build.iter().any(|arg| arg == r"C:\work\parity\proj\build"));
        assert!(
            preset
                .iter()
                .any(|arg| arg == r"-DCMAKE_TOOLCHAIN_FILE=C:\work\parity\tc.cmake"),
            "{preset:?}"
        );
    }
}
