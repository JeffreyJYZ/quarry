#![allow(unused_imports)]

pub use std::path::Path;

use super::*;

/// The profile and target flags, which are the two things a build can now be asked for.
#[cfg(test)]
pub mod tests_group_profiles {
    use super::*;

    #[test]
    pub fn relwithdebinfo_and_minsizerel_reach_cmake_as_build_types() {
        for (profile, configuration) in [
            (BuildProfile::RelWithDebInfo, "RelWithDebInfo"),
            (BuildProfile::MinSizeRel, "MinSizeRel"),
        ] {
            let configure = cmake_configure_argv("/projects/demo", "/projects/demo/build", profile);
            assert!(
                configure
                    .iter()
                    .any(|arg| arg == &format!("-DCMAKE_BUILD_TYPE={configuration}")),
                "the configure argv does not name {configuration}: {configure:?}"
            );
            let build = cmake_build_argv("/projects/demo/build", profile, None);
            assert_eq!(
                build.last().map(String::as_str),
                Some(configuration),
                "the build argv does not name {configuration}: {build:?}"
            );
        }
    }

    #[test]
    pub fn a_named_target_is_one_flag_and_the_whole_tree_is_no_flag() {
        let one = cmake_build_argv("/projects/demo/build", false, Some("parity_one"));
        assert_eq!(
            one.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "--build",
                "/projects/demo/build",
                "--config",
                "Debug",
                "--target",
                "parity_one"
            ]
        );
        let preset = preset_build_argv("debug", "Debug", Some("parity_one"));
        assert_eq!(
            preset.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "--build",
                "--preset",
                "debug",
                "--config",
                "Debug",
                "--target",
                "parity_one"
            ]
        );
        let everything = cmake_build_argv("/projects/demo/build", false, None);
        assert!(!everything.iter().any(|arg| arg == "--target"));
        let blank = cmake_build_argv("/projects/demo/build", false, Some("  "));
        assert!(!blank.iter().any(|arg| arg == "--target"));
    }

    #[test]
    pub fn the_profile_names_its_cmake_configuration_and_its_debug_info() {
        for profile in [
            BuildProfile::Debug,
            BuildProfile::Release,
            BuildProfile::RelWithDebInfo,
            BuildProfile::MinSizeRel,
        ] {
            assert_eq!(
                BuildProfile::from_wire(profile.wire()).expect("a wire value parses back"),
                profile
            );
            assert_eq!(cmake_config(profile), profile.cmake_config());
        }
        assert!(BuildProfile::RelWithDebInfo.debug_info());
        assert!(BuildProfile::Debug.debug_info());
        assert!(!BuildProfile::MinSizeRel.debug_info());
        assert!(!BuildProfile::Release.debug_info());
    }
}
