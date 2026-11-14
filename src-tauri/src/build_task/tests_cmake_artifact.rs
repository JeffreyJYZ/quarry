#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

use super::*;

/// Reading the target names a CMake build prints, and turning one into a runnable file.
///
/// Each case here is a way Run used to launch the wrong path: a name that resolved to nothing, a
/// library that shared a target's name, or a newer helper the build wrote beside the program.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_cmake_artifact {
    use super::*;
    use crate::test_support::TempDir;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    fn write_executable(path: &Path) {
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(path, b"#!/bin/sh\n").expect("write");
        #[cfg(unix)]
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).expect("chmod");
    }

    fn write_text(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(path, text).expect("write");
    }

    fn recent() -> SystemTime {
        SystemTime::now() - Duration::from_secs(60)
    }

    #[test]
    pub fn only_the_reported_target_that_is_a_program_is_chosen() {
        let directory = TempDir::new("cmake-two-targets");
        let root = directory.path();
        let demo = root.join("demo");

        write_executable(&demo);

        // The library target reports too, and no file named `app_lib` exists.
        let output = "[ 50%] Built target app_lib\n[100%] Built target demo\n";
        assert_eq!(
            cmake_artifact_for(output, root, recent(), None).as_deref(),
            Some(demo.to_string_lossy().as_ref())
        );
    }

    #[test]
    pub fn a_target_printed_twice_is_one_candidate() {
        let output = "[ 25%] Built target demo\n[100%] Built target demo\n";
        assert_eq!(reported_targets(output), vec!["demo".to_string()]);
    }

    #[test]
    pub fn an_absent_target_falls_back_instead_of_naming_a_phantom_path() {
        let directory = TempDir::new("cmake-absent");
        let root = directory.path();
        let worker = root.join("worker");

        write_executable(&worker);

        // `Built target demo` with no `demo` on disk: the reported name must not become a path.
        let artifact = cmake_artifact_for("Built target demo\n", root, recent(), None);
        assert_eq!(artifact.as_deref(), Some(worker.to_string_lossy().as_ref()));
    }

    #[test]
    pub fn a_library_target_is_never_the_artifact() {
        let directory = TempDir::new("cmake-library");
        let root = directory.path();

        // An executable bit on a library file must not make the target look runnable.
        write_executable(&root.join("libmathlib.a"));
        write_executable(&root.join("mathlib.dylib"));

        assert_eq!(
            cmake_artifact_for("Built target mathlib\n", root, recent(), None),
            None
        );
    }

    #[test]
    pub fn a_newer_helper_does_not_take_the_launch_from_the_reported_target() {
        let directory = TempDir::new("cmake-helper");
        let root = directory.path();
        let demo = root.join("demo");

        write_executable(&demo);
        std::thread::sleep(Duration::from_millis(20));
        write_executable(&root.join("demo_test"));

        // Old answer: the newest file the build wrote, here the test binary.
        assert_eq!(
            choose_artifact(&executable_candidates(root), recent(), None).as_deref(),
            Some(root.join("demo_test").to_string_lossy().as_ref())
        );
        assert_eq!(
            cmake_artifact_for("Built target demo\n", root, recent(), None).as_deref(),
            Some(demo.to_string_lossy().as_ref())
        );
    }

    #[test]
    pub fn a_multi_config_layout_resolves_under_its_configuration() {
        let directory = TempDir::new("cmake-multiconfig");
        let root = directory.path();
        let demo = root.join("Release/demo");

        write_executable(&demo);

        assert_eq!(
            resolve_target(root, "demo", recent()).as_deref(),
            Some(demo.as_path())
        );
    }

    #[test]
    pub fn a_nested_subdirectory_target_resolves_by_its_name() {
        let directory = TempDir::new("cmake-nested");
        let root = directory.path();
        let demo = root.join("apps/tools/demo");

        write_executable(&demo);

        assert_eq!(
            resolve_target(root, "demo", recent()).as_deref(),
            Some(demo.as_path())
        );
    }

    /// The files here are the shapes CMake 4.4 writes for an `OUTPUT_NAME` target; both were read
    /// from a generated build tree rather than imagined.
    #[test]
    pub fn an_output_name_resolves_through_the_generated_link_command() {
        let directory = TempDir::new("cmake-output-name");
        let root = directory.path();
        let renamed = root.join("sub/app-renamed");

        write_text(
            &root.join("CMakeFiles/TargetDirectories.txt"),
            &format!("{}\n", root.join("sub/CMakeFiles/app.dir").display()),
        );
        write_text(
            &root.join("sub/CMakeFiles/app.dir/link.txt"),
            "/usr/bin/cc -g CMakeFiles/app.dir/main.c.o -o app-renamed\n",
        );
        write_executable(&renamed);

        // No file is named `app`, so every name-shaped layout misses it.
        assert_eq!(
            resolve_target(root, "app", recent()).as_deref(),
            Some(renamed.as_path())
        );
    }

    /// Ninja names the output in a `phony` alias, one per configuration, so every configuration's
    /// file is a candidate and the one this build wrote wins.
    #[test]
    pub fn a_ninja_alias_resolves_the_output_name_of_each_configuration() {
        let directory = TempDir::new("cmake-output-ninja");
        let root = directory.path();
        let debug = root.join("Debug/renamed");
        let release = root.join("Release/renamed");

        write_text(
            &root.join("build.ninja"),
            "build demo: phony Debug/renamed\n",
        );
        write_text(
            &root.join("build-Release.ninja"),
            "build demo: phony Release/renamed\n",
        );
        // Only the release copy exists, so it is the answer while debug is absent.
        write_executable(&release);
        assert_eq!(
            resolve_target(root, "demo", recent()).as_deref(),
            Some(release.as_path())
        );

        // Once the debug copy is written by this build, it takes the launch.
        std::thread::sleep(Duration::from_millis(20));
        write_executable(&debug);
        assert_eq!(
            resolve_target(root, "demo", recent()).as_deref(),
            Some(debug.as_path())
        );
    }
}
