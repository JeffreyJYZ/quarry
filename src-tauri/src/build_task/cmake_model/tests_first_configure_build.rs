#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The first configure of a fresh tree, measured against cmake instead of the argv alone.
///
/// Two facts the plan cannot read off the disk are settled here: a tree whose generator turns out
/// single-config still compiles with `-g`, and a tree whose generator turns out multi-config is
/// never sent a build type. The second is measured on a real `Ninja Multi-Config` tree holding the
/// value a guess records there, so the assertion is about cmake's own cache rather than a fixture.
#[cfg(all(test, unix))]
#[allow(dead_code)]
pub mod tests_cmake_first_configure_build {
    use super::*;
    use crate::build_task::{
        BUILD_TYPE_VARIABLE, BuildProfile, BuildReport, BuildState, CMAKE_PROGRAM, DATABASE_FILE,
        cache_value, cmake_plan, generator_at, run_cmake_build,
    };
    use crate::test_support::TempDir;

    const MANIFEST_TEXT: &str = "cmake_minimum_required(VERSION 3.20)\n\
         project(first_configure CXX)\n\
         add_executable(first_configure main.cpp)\n";

    const SOURCE: &str = "int main() { return 0; }\n";

    fn cmake() -> Option<PathBuf> {
        Some(crate::resolve::resolve(CMAKE_PROGRAM)?.path)
    }

    /// A project nothing has configured: no preset, no cache, no database.
    fn project(tag: &str) -> Option<(TempDir, PathBuf)> {
        cmake()?;
        let directory = TempDir::new(tag);
        let root = directory.path().canonicalize().ok()?;
        fs::write(root.join(MANIFEST), MANIFEST_TEXT).ok()?;
        fs::write(root.join("main.cpp"), SOURCE).ok()?;
        Some((directory, root))
    }

    fn build(root: &Path) -> BuildReport {
        run_cmake_build(
            &BuildState::default(),
            &root.display().to_string(),
            BuildProfile::Debug,
            None,
        )
        .expect("cmake must be runnable")
    }

    /// The compile command the tree recorded for `file`, however the generator spelled it.
    fn arguments(build_root: &Path, file: &str) -> Vec<String> {
        let database = build_root.join(DATABASE_FILE);
        crate::project::read_entries(&database)
            .into_iter()
            .find(|entry| entry.argv.iter().any(|arg| arg.ends_with(file)))
            .map(|entry| entry.argv)
            .expect("an entry for the source")
    }

    #[test]
    fn a_fresh_single_config_tree_compiles_with_debug_info() {
        let Some((_directory, root)) = project("first-configure-debug-info") else {
            return;
        };
        let build_root = root.join(BUILD_DIR);

        let report = build(&root);

        assert!(report.success, "the first build failed: {}", report.summary);
        let generator = generator_at(&build_root).unwrap_or_default();
        if is_multi_config(Some(&generator)) {
            // A machine whose default generator is multi-config: the other half of this rule applies.
            return;
        }
        assert_eq!(
            cache_value(&build_root, BUILD_TYPE_VARIABLE).as_deref(),
            Some("Debug"),
            "the build type the plan passed is the one the tree was configured with"
        );
        assert!(
            arguments(&build_root, "main.cpp").contains(&"-g".to_string()),
            "the first build of a single-config tree carries debug info"
        );
        let after = cmake_plan(&root, BuildProfile::Debug, &CmakeOptions::default()).expect("plan");
        assert_eq!(
            after.generator.as_deref(),
            Some(generator.as_str()),
            "the cache answers the generator question now"
        );
        assert_eq!(after.note, None, "so nothing is guessed any more");
    }

    #[test]
    fn a_multi_config_tree_is_never_sent_a_build_type() {
        let Some((_directory, root)) = project("first-configure-multi-tree") else {
            return;
        };
        let program = cmake().expect("cmake");
        let known = std::process::Command::new(&program)
            .arg("--help")
            .output()
            .is_ok_and(|out| String::from_utf8_lossy(&out.stdout).contains("Ninja Multi-Config"));
        if !known || crate::resolve::resolve("ninja").is_none() {
            return;
        }
        let build_root = root.join(BUILD_DIR);
        // Exactly what CMake records when the first configure's guess reaches a multi-config
        // generator: the value is kept in the cache and no configuration is ever built from it.
        let configured = std::process::Command::new(&program)
            .args([
                "-S",
                &root.display().to_string(),
                "-B",
                &build_root.display().to_string(),
                "-G",
                "Ninja Multi-Config",
                "-DCMAKE_BUILD_TYPE=Debug",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ])
            .output()
            .expect("run cmake");
        assert!(configured.status.success(), "{configured:?}");
        let recorded = cache_value(&build_root, BUILD_TYPE_VARIABLE);
        assert_eq!(recorded.as_deref(), Some("Debug"));

        // The product reads that cache, so its own configure asks for no build type and its build
        // names the configuration; the tree's record is left as it was found.
        let plan = cmake_plan(&root, BuildProfile::Debug, &CmakeOptions::default()).expect("plan");
        assert_eq!(plan.generator.as_deref(), Some("Ninja Multi-Config"));
        assert!(
            !plan
                .configure
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE")),
            "{:?}",
            plan.configure
        );
        assert!(
            plan.build
                .windows(2)
                .any(|pair| pair[0] == "--config" && pair[1] == "Debug"),
            "{:?}",
            plan.build
        );

        let report = build(&root);
        assert!(report.success, "the build failed: {}", report.summary);
        assert_eq!(
            cache_value(&build_root, BUILD_TYPE_VARIABLE),
            recorded,
            "the tree's own record is read, never rewritten"
        );
        assert!(
            build_root.join("Debug").join("first_configure").is_file(),
            "the configuration the build asks for is the one that was written"
        );
    }
}
