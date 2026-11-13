#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::SystemTime;

use super::*;

/// A real configure and two builds, so the reload is proven against cmake rather than asserted.
#[cfg(all(test, unix))]
#[allow(dead_code)]
pub mod cmake_stale_fixture {
    use super::*;
    use crate::build_task::*;
    use crate::test_support::TempDir;

    /// The tree as it looks before anything was added to it.
    const MANIFEST_V1: &str = "cmake_minimum_required(VERSION 3.20)\n\
         project(demo CXX)\n\
         add_executable(demo main.cpp)\n";

    /// The same tree with a second source on the existing target and a second executable.
    const MANIFEST_V2: &str = "cmake_minimum_required(VERSION 3.20)\n\
         project(demo CXX)\n\
         add_executable(demo main.cpp helper.cpp)\n\
         add_executable(extra extra.cpp)\n";

    fn available() -> bool {
        crate::resolve::resolve(CMAKE_PROGRAM).is_some()
    }

    fn project(tag: &str) -> Option<(TempDir, PathBuf)> {
        if !available() {
            return None;
        }
        let directory = TempDir::new(tag);
        let root = directory.path().canonicalize().expect("canonical root");
        fs::write(root.join(MANIFEST), MANIFEST_V1).expect("manifest");
        fs::write(root.join("main.cpp"), "int main() { return 0; }\n").expect("main");
        Some((directory, root))
    }

    fn build(root: &Path) -> BuildReport {
        run_cmake_build(&BuildState::default(), &root.display().to_string(), false)
            .expect("cmake must be runnable")
    }

    /// Every file the last configure wrote; a new one means another configure ran.
    fn reply_files(build_root: &Path) -> Vec<String> {
        let mut names = fs::read_dir(reply_dir(build_root))
            .expect("reply directory")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<String>>();
        names.sort();
        names
    }

    fn modified(path: &Path) -> SystemTime {
        fs::metadata(path)
            .expect("metadata")
            .modified()
            .expect("mtime")
    }

    #[test]
    fn a_new_source_and_target_reach_the_next_build_and_a_quiet_one_reconfigures_nothing() {
        let Some((_directory, root)) = project("cmake-stale-reload") else {
            return;
        };

        let first = build(&root);
        assert!(first.success, "the first build failed: {}", first.summary);
        let build_root = root.join(BUILD_DIR);
        let cache = build_root.join(CMAKE_CACHE);
        let replies = reply_files(&build_root);
        let cache_time = modified(&cache);
        eprintln!(
            "first configure: {} replies, summary {:?}",
            replies.len(),
            first.summary
        );

        // Nothing changed, so nothing may be configured: no new reply object, no cache write.
        let quiet = build(&root);
        assert!(quiet.success, "the quiet build failed: {}", quiet.summary);
        eprintln!(
            "quiet build: {} replies, cache mtime unchanged {}, summary {:?}",
            reply_files(&build_root).len(),
            modified(&cache) == cache_time,
            quiet.summary
        );
        assert_eq!(
            reply_files(&build_root),
            replies,
            "an unchanged tree must not run a configure"
        );
        assert_eq!(
            modified(&cache),
            cache_time,
            "the cache timestamp is untouched by a build that configured nothing"
        );
        assert!(
            !quiet.summary.contains("configured again"),
            "an unchanged tree reports no reload: {}",
            quiet.summary
        );

        // Adding a source and a target is the change CLion reloads for.
        fs::write(root.join("helper.cpp"), "int helper() { return 1; }\n").expect("helper");
        fs::write(root.join("extra.cpp"), "int main() { return 2; }\n").expect("extra");
        fs::write(root.join(MANIFEST), MANIFEST_V2).expect("manifest");

        let reloaded = build(&root);
        assert!(
            reloaded.success,
            "the reloading build failed: {}",
            reloaded.summary
        );
        eprintln!(
            "after the manifest changed: {} replies, summary {:?}",
            reply_files(&build_root).len(),
            reloaded.summary
        );
        assert!(
            reloaded.summary.contains("configured again"),
            "the reload is reported: {}",
            reloaded.summary
        );
        assert!(
            reply_files(&build_root) != replies,
            "a changed manifest must write a new reply"
        );

        let targets = cmake_run_targets(&build_root)
            .into_iter()
            .map(|(name, _)| name)
            .collect::<Vec<String>>();
        assert!(targets.contains(&"demo".to_string()), "{targets:?}");
        assert!(
            targets.contains(&"extra".to_string()),
            "the target added to the manifest is in the run list: {targets:?}"
        );
        assert!(
            build_root.join("extra").is_file(),
            "the new source compiled into its own program"
        );

        let database = fs::read_to_string(build_root.join(DATABASE_FILE)).expect("database");
        eprintln!("run targets: {targets:?}");
        for source in ["helper.cpp", "extra.cpp"] {
            assert!(
                database.contains(source),
                "{source} is a translation unit of the reloaded model"
            );
        }
        eprintln!(
            "compile database names helper.cpp and extra.cpp: {}",
            ["helper.cpp", "extra.cpp"]
                .iter()
                .all(|source| database.contains(source))
        );
    }
}
