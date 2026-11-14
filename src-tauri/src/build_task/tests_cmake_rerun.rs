#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

use super::*;

/// Running a target a second time: the build has nothing to do, and Run must still launch it.
///
/// A Ninja or Xcode build prints no `Built target` line when it finds the target up to date, and it
/// writes no file, so the mtime rule alone reports "produced nothing" for a binary that is sitting
/// there and is current.
#[cfg(all(test, unix))]
#[allow(dead_code)]
pub mod tests_group_cmake_rerun {
    use super::*;
    use crate::test_support::TempDir;
    use std::os::unix::fs::PermissionsExt;

    /// The generator this fixture uses: it prints no target line on an up-to-date build.
    pub const GENERATOR: &str = "Ninja";

    /// Whether this machine can run the fixture at all; it skips rather than failing.
    fn ready() -> bool {
        let Ok(output) = std::process::Command::new(CMAKE_PROGRAM)
            .args(["--help"])
            .output()
        else {
            return false;
        };
        String::from_utf8_lossy(&output.stdout).contains(GENERATOR)
    }

    /// A project with one executable named `demo`, configured with the generator of this fixture.
    ///
    /// The generator is named by a preset because it is the thing under test: CMake's default on
    /// this platform is a Makefiles tree, which prints `Built target` even when it did nothing and
    /// would hide the whole case.
    fn project(tag: &str) -> Option<(TempDir, PathBuf)> {
        if !ready() {
            return None;
        }
        let directory = TempDir::new(tag);
        let root = directory.path().canonicalize().expect("canonical root");
        fs::write(
            root.join(PRESETS_FILE),
            format!(
                r#"{{ "version": 3,
                    "configurePresets": [ {{
                        "name": "dev",
                        "generator": "{GENERATOR}",
                        "binaryDir": "${{sourceDir}}/build"
                    }} ] }}"#
            ),
        )
        .expect("presets");
        fs::write(
            root.join(MANIFEST),
            "cmake_minimum_required(VERSION 3.20)\n\
             project(demo CXX)\n\
             add_executable(demo main.cpp)\n",
        )
        .expect("manifest");
        fs::write(root.join("main.cpp"), "int main() { return 0; }\n").expect("source");
        Some((directory, root))
    }

    /// One build through the product path, exactly as the Run button asks for one.
    fn build(root: &Path, target: Option<&str>) -> BuildReport {
        run_cmake_build(
            &BuildState::default(),
            &root.display().to_string(),
            false,
            target,
        )
        .expect("cmake must be runnable")
    }

    #[test]
    pub fn a_second_run_of_an_up_to_date_target_launches_the_same_binary() {
        let Some((_directory, root)) = project("cmake-rerun") else {
            return;
        };
        let binary = root.join(BUILD_DIR).join("demo");

        let first = build(&root, Some("demo"));
        assert!(first.success, "the first build failed: {}", first.summary);
        assert_eq!(
            first.artifact,
            Some(binary.display().to_string()),
            "the first build names the program it wrote"
        );
        assert!(binary.is_file(), "the binary is on disk");

        // Nothing changed, so this build writes nothing and prints no target line; the program the
        // first run launched is still the one to launch.
        let second = build(&root, Some("demo"));
        assert!(
            second.success,
            "the second build failed: {}",
            second.summary
        );
        assert_eq!(
            second.artifact, first.artifact,
            "an up-to-date build names the binary the first one wrote"
        );
    }

    fn write_executable(path: &Path) {
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(path, b"#!/bin/sh\n").expect("write");
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).expect("chmod");
    }

    /// A build that finds its target up to date prints no line and writes no file, so the target it
    /// was asked for is the only thing that can name the binary.
    #[test]
    pub fn an_up_to_date_build_names_the_targets_existing_binary() {
        let directory = TempDir::new("cmake-uptodate");
        let root = directory.path();
        let demo = root.join("demo");

        write_executable(&demo);

        // Everything on disk predates this build, and it printed no target of its own.
        let since = SystemTime::now() + Duration::from_secs(5);
        assert_eq!(
            cmake_artifact_for("", root, since, None),
            None,
            "the mtime rule alone reports nothing, which is the bug"
        );
        assert_eq!(
            cmake_artifact_for("", root, since, Some("demo")).as_deref(),
            Some(demo.to_string_lossy().as_ref()),
            "the target's own binary is the one to launch"
        );
    }

    /// "Up to date" is not "produced nothing": a target with no binary is still nothing to run.
    #[test]
    pub fn a_build_that_wrote_nothing_for_an_absent_target_names_nothing() {
        let directory = TempDir::new("cmake-uptodate-absent");
        let root = directory.path();
        let since = SystemTime::now() + Duration::from_secs(5);

        write_executable(&root.join("other"));

        assert_eq!(cmake_artifact_for("", root, since, Some("demo")), None);
        assert_eq!(cmake_artifact_for("", root, since, None), None);
    }

    /// The mtime rule keeps its teeth: a binary this build wrote wins over the up-to-date target.
    #[test]
    pub fn a_binary_the_build_wrote_wins_over_the_up_to_date_target() {
        let directory = TempDir::new("cmake-uptodate-written");
        let root = directory.path();
        let helper = root.join("demo_test");

        write_executable(&root.join("demo"));
        std::thread::sleep(Duration::from_millis(20));
        let since = SystemTime::now();
        std::thread::sleep(Duration::from_millis(20));
        write_executable(&helper);

        assert_eq!(
            cmake_artifact_for("", root, since, Some("demo")).as_deref(),
            Some(helper.to_string_lossy().as_ref()),
            "the file this build wrote decides, even though the target is not it"
        );
    }
}
