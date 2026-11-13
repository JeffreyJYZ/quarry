#![allow(unused_imports)]

//! The database a plain C/C++ project's own flags are written to.

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
            "quarry-plain-database-{label}-{}-{unique}",
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

    fn database(root: &Path) -> PathBuf {
        root.join(crate::build_task::QUARRY_BUILD_DIR)
            .join(crate::project::DATABASE_FILE)
    }

    #[test]
    fn a_database_records_one_entry_per_source() {
        let root = scratch("entries");
        write(&root, "lib/greet.h", "#pragma once\n");
        write(&root, "lib/greet.cpp", "#include \"greet.h\"\n");
        write(&root, "src/main.cpp", "#include \"lib/greet.h\"\n");
        write(
            &root,
            ".quarry/settings.json",
            r#"{ "cppFlags": "-DPARITY_PLAIN=1" }"#,
        );
        let sources = collect_plain_clang_sources(&root).expect("the project's sources");

        let written = synthesize_plain_database(&root, &sources)
            .expect("the database is written")
            .expect("a database was needed");

        assert_eq!(written.files, 2);
        assert_eq!(written.path, database(&root));
        let note = written.note().expect("a written database is reported");
        assert!(note.contains("compile_commands.json"), "{note}");
        assert!(note.contains("-DPARITY_PLAIN=1"), "{note}");

        let entries = crate::project::read_entries(&written.path);
        assert_eq!(entries.len(), 2);
        let main = entries
            .iter()
            .find(|entry| entry.argv.iter().any(|arg| arg.ends_with("main.cpp")))
            .expect("the source entry");
        assert_eq!(main.argv[0], "clang++");
        assert_eq!(main.directory, root);
        for flag in [
            "-std=c++20".to_string(),
            format!("-I{}", root.display()),
            "-DPARITY_PLAIN=1".to_string(),
            "-c".to_string(),
        ] {
            assert!(main.argv.contains(&flag), "missing {flag}: {:?}", main.argv);
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_second_synthesis_of_the_same_flags_writes_nothing() {
        let root = scratch("unchanged");
        write(&root, "main.cpp", "int main() { return 0; }\n");
        let sources = collect_plain_clang_sources(&root).expect("sources");
        let first = synthesize_plain_database(&root, &sources)
            .expect("first write")
            .expect("a database was needed");
        assert!(first.written && first.note().is_some());

        let second = synthesize_plain_database(&root, &sources)
            .expect("second read")
            .expect("the database still describes the project");

        assert_eq!(second.path, first.path);
        assert!(
            !second.written && second.note().is_none(),
            "an unchanged database is not rewritten, and needs no note"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_real_database_is_never_replaced() {
        let root = scratch("real-database");
        write(&root, "main.cpp", "int main() { return 0; }\n");
        write(&root, crate::project::DATABASE_FILE, "[]");
        let sources = collect_plain_clang_sources(&root).expect("sources");

        let written = synthesize_plain_database(&root, &sources).expect("no error");

        assert!(
            written.is_none(),
            "a generator's own database stays authoritative"
        );
        assert!(!database(&root).exists());
        let _ = fs::remove_dir_all(&root);
    }

    /// `compile_flags.txt` and `.clangd` are the user's instruction to clangd, which reads them
    /// itself: a database of ours would replace the first and add a second description to the second.
    #[test]
    fn the_users_own_instruction_files_win() {
        for file in INSTRUCTION_FILES {
            let root = scratch("instruction");
            write(&root, "main.cpp", "int main() { return 0; }\n");
            write(&root, file, "-std=c++23\n");
            let sources = collect_plain_clang_sources(&root).expect("sources");

            let written = synthesize_plain_database(&root, &sources).expect("no error");

            assert!(written.is_none(), "{file} is the user's own instruction");
            assert!(!database(&root).exists(), "{file}");
            let _ = fs::remove_dir_all(&root);
        }
    }
}
