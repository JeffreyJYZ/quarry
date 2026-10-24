#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind};
pub use regex::Regex;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
    use super::*;

    /// A temporary directory that cleans itself up.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut path = std::env::temp_dir();
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0);
            path.push(format!(
                "quarry-launch-{tag}-{}-{stamp}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("temporary directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        /// Write a file at a path relative to the directory, creating its parent.
        fn file(&self, relative: &str) -> PathBuf {
            let path = self.0.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("temporary parent");
            }
            fs::write(&path, "binary").expect("temporary file");
            path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn info(root: &Path, name: &str, kind: ProjectKind) -> ProjectInfo {
        ProjectInfo {
            root: root.display().to_string(),
            name: name.to_string(),
            kind,
            build_root: root.display().to_string(),
            launch_config: None,
        }
    }

    #[test]
    pub fn the_cmake_target_is_preferred_over_the_directory_name() {
        let directory = TempDir::new("cmake-target");
        fs::write(
            directory.path().join("CMakeLists.txt"),
            "project(demo)\nadd_executable(app main.cpp)\n",
        )
        .expect("manifest");

        let names = program_names(directory.path(), "demo-dir", ProjectKind::Cmake);

        assert_eq!(names, vec!["app".to_string(), "demo-dir".to_string()]);
        let composed = compose_cpp(
            &info(directory.path(), "demo-dir", ProjectKind::Cmake),
            false,
        );
        assert_eq!(
            Path::new(&composed.program),
            directory.path().join("app"),
            "the composed program is not the manifest target"
        );
    }

    #[test]
    pub fn a_variable_target_falls_back_to_the_directory_name() {
        let directory = TempDir::new("cmake-variable");
        fs::write(
            directory.path().join("CMakeLists.txt"),
            "add_executable(${PROJECT_NAME} main.cpp)\n",
        )
        .expect("manifest");

        assert_eq!(cmake_target(directory.path()), None);
        assert_eq!(
            program_names(directory.path(), "demo", ProjectKind::Cmake),
            vec!["demo".to_string()]
        );
    }

    #[test]
    pub fn a_built_artifact_wins_over_the_expected_path() {
        let directory = TempDir::new("plain-built");
        let built = directory.file(".quarry/build/demo");

        let composed = compose_cpp(&info(directory.path(), "demo", ProjectKind::Unknown), false);

        assert_eq!(Path::new(&composed.program), built);
        assert!(composed.args.is_empty(), "a prefill adds no arguments");
        assert!(
            composed.init_commands.is_empty(),
            "C/C++ has no LLDB provider scripts"
        );
    }

    #[test]
    pub fn a_build_directory_moves_the_cmake_fallback_under_it() {
        let directory = TempDir::new("cmake-build-dir");
        fs::create_dir_all(directory.path().join("build")).expect("build directory");

        let composed = compose_cpp(&info(directory.path(), "demo", ProjectKind::Cmake), true);

        assert_eq!(
            Path::new(&composed.program),
            directory.path().join("build").join("demo")
        );
        assert!(composed.stop_on_entry, "stop-on-entry is passed through");
        assert_eq!(
            Path::new(&composed.cwd),
            directory.path(),
            "the working directory is the project root"
        );
    }

    #[test]
    pub fn a_compile_commands_project_prefills_quarrys_own_output() {
        let directory = TempDir::new("compile-commands");

        let composed = compose_cpp(
            &info(directory.path(), "demo", ProjectKind::CompileCommands),
            false,
        );

        assert_eq!(
            Path::new(&composed.program),
            directory.path().join(QUARRY_BUILD_DIR).join("demo")
        );
    }

    #[test]
    pub fn compose_dispatches_a_cmake_project_to_the_cpp_composition() {
        let directory = TempDir::new("cmake-dispatch");
        fs::write(
            directory.path().join("CMakeLists.txt"),
            "project(demo)\nadd_executable(app main.cpp)\n",
        )
        .expect("manifest");
        let root = directory.path().display().to_string();

        let composed = compose(&root, false).expect("a CMake project composes without a build");
        let canonical = directory.path().canonicalize().expect("canonical root");

        assert_eq!(Path::new(&composed.program), canonical.join("app"));
        assert_eq!(Path::new(&composed.cwd), canonical);
    }

    #[test]
    pub fn cmake_candidates_try_the_top_level_binary_first() {
        let root = Path::new("/work/demo");

        let paths = paths_for_name(root, "app", ProjectKind::Cmake);

        assert_eq!(paths[0], PathBuf::from("/work/demo/app"));
        assert!(paths.contains(&PathBuf::from("/work/demo/build/app")));
        assert!(paths.contains(&PathBuf::from("/work/demo/build/Debug/app")));
        assert!(paths.contains(&PathBuf::from("/work/demo/cmake-build-debug/app")));
    }

    #[test]
    pub fn plain_candidates_try_quarrys_build_output_first() {
        let root = Path::new("/work/demo");

        assert_eq!(
            paths_for_name(root, "app", ProjectKind::Unknown),
            vec![
                PathBuf::from("/work/demo/.quarry/build/app"),
                PathBuf::from("/work/demo/build/app"),
                PathBuf::from("/work/demo/app"),
            ]
        );
    }
}
