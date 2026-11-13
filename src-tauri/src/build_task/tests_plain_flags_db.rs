#![allow(unused_imports)]

//! The flags a plain C/C++ project derives for itself, from its layout and its own settings.

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn scratch(label: &str) -> PathBuf {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "quarry-plain-flags-{label}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create scratch directory");
        root
    }

    fn write(root: &Path, name: &str, text: &str) {
        let target = root.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(target, text).expect("write file");
    }

    #[test]
    fn the_root_and_its_include_directory_are_searched() {
        let root = scratch("includes");
        fs::create_dir_all(root.join("include")).expect("create include");

        let flags = PlainFlags::for_project(&root, &[PathBuf::from("src/main.cpp")]);

        assert_eq!(
            flags.flags(),
            vec![
                format!("-I{}", root.display()),
                format!("-I{}", root.join("include").display()),
            ]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_project_without_an_include_directory_searches_its_root_only() {
        let root = scratch("no-includes");

        let flags = PlainFlags::for_project(&root, &[PathBuf::from("main.cpp")]);

        assert_eq!(flags.flags(), vec![format!("-I{}", root.display())]);
        let _ = fs::remove_dir_all(&root);
    }

    /// The default has to be above what the compiler picks on its own, or a C++20 file (a
    /// `std::format` call) is analysed under a standard its build never used.
    #[test]
    fn the_language_decides_the_driver_and_the_standard() {
        let root = scratch("language");

        let cxx = PlainFlags::for_project(&root, &[PathBuf::from("main.cpp")]);
        assert_eq!(cxx.compiler(), "clang++");
        assert_eq!(cxx.standard(), "-std=c++20");

        let c = PlainFlags::for_project(&root, &[PathBuf::from("main.c")]);
        assert_eq!(c.compiler(), "clang");
        assert_eq!(c.standard(), "-std=c17");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_projects_own_flags_reach_the_command() {
        let root = scratch("settings");
        write(
            &root,
            ".quarry/settings.json",
            r#"{ "cppFlags": "-DPARITY_PLAIN=1 -Wall" }"#,
        );

        let flags = PlainFlags::for_project(&root, &[PathBuf::from("main.cpp")]);

        assert!(flags.flags().contains(&"-DPARITY_PLAIN=1".to_string()));
        assert!(flags.flags().contains(&"-Wall".to_string()));
        assert!(
            flags.summary().contains("-std=c++20"),
            "{}",
            flags.summary()
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_project_that_names_its_own_standard_keeps_it() {
        let root = scratch("standard");
        write(
            &root,
            ".quarry/settings.json",
            r#"{ "cppFlags": ["-std=c++23"] }"#,
        );

        let flags = PlainFlags::for_project(&root, &[PathBuf::from("main.cpp")]);
        let command = flags.command_flags();
        let standards: Vec<&String> = command
            .iter()
            .filter(|flag| flag.starts_with("-std="))
            .collect();

        assert_eq!(standards, vec!["-std=c++23"], "{command:?}");
        let _ = fs::remove_dir_all(&root);
    }

    /// A database is the project's own build description, so its flags are passed through untouched
    /// and its presence is what keeps a synthesised one from being written.
    #[test]
    fn a_project_with_a_database_keeps_the_build_it_had() {
        let root = scratch("database-flags");
        write(&root, "main.cpp", "int main() { return 0; }\n");
        let text = format!(
            r#"[{{"directory": "{}", "arguments": ["clang++", "-Iinclude", "-std=c++17", "-c", "main.cpp"]}}]"#,
            root.display()
        );
        write(&root, crate::project::DATABASE_FILE, &text);

        let flags = build_flags(&root, &[PathBuf::from("main.cpp")]);

        assert!(flags.from_database);
        assert_eq!(
            flags.flags,
            vec![
                format!("-I{}/include", root.display()),
                "-std=c++17".to_string(),
            ]
        );
        let _ = fs::remove_dir_all(&root);
    }
}
