#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod support {
    use super::*;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    pub const CMAKE_LISTS: &str =
        "cmake_minimum_required(VERSION 3.20)\nproject(demo CXX)\nadd_executable(demo main.cpp)\n";

    /// One configure preset whose binary directory is outside every conventional name.
    pub const PRESETS: &str = r#"{
  "version": 6,
  "configurePresets": [
    {
      "name": "debug",
      "binaryDir": "${sourceDir}/out/debug",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_EXPORT_COMPILE_COMMANDS": "ON"
      }
    }
  ]
}
"#;

    pub struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        pub fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-handoff-plan-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        pub fn write(&self, name: &str, contents: &str) {
            let target = self.path.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, contents).expect("write fixture file");
        }

        pub fn root(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }

        pub fn preset_project(&self) -> ProjectInfo {
            self.write("CMakeLists.txt", CMAKE_LISTS);
            self.write("main.cpp", "int main() { return 0; }\n");
            self.write("CMakePresets.json", PRESETS);
            self.info()
        }

        pub fn info(&self) -> ProjectInfo {
            let root = self.root().display().to_string();
            ProjectInfo {
                root: root.clone(),
                opened_root: root.clone(),
                name: "demo".to_string(),
                kind: ProjectKind::Cmake,
                build_root: root,
                launch_config: None,
            }
        }

        /// A C++ project with no build system: no manifest, no database, one source of each kind.
        pub fn plain_project(&self) -> ProjectInfo {
            self.write("lib/greet.h", "int greeting();\n");
            self.write(
                "src/main.cpp",
                "#include \"lib/greet.h\"\nint main() { return greeting(); }\n",
            );
            self.plain_info()
        }

        pub fn plain_info(&self) -> ProjectInfo {
            let root = self.root().display().to_string();
            ProjectInfo {
                root: root.clone(),
                opened_root: root.clone(),
                name: "demo".to_string(),
                kind: ProjectKind::Unknown,
                build_root: root,
                launch_config: None,
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    pub fn cmake_available() -> bool {
        crate::resolve::resolve(crate::build_task::CMAKE_PROGRAM).is_some()
    }
}
