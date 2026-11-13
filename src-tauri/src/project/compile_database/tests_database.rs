#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway directory under the system temp dir, removed on drop.
    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-database-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        fn write(&self, name: &str, contents: &str) {
            let target = self.path.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, contents).expect("write fixture file");
        }

        fn root(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn database(entries: &str) -> String {
        format!("[{entries}]")
    }

    #[test]
    fn the_build_directory_is_found_without_a_manifest() {
        let fixture = Fixture::new("build");
        fixture.write("build/compile_commands.json", &database(""));
        assert_eq!(
            locate_database(&fixture.root(), &fixture.root()),
            Some(fixture.root().join("build"))
        );
    }

    #[test]
    fn a_source_root_database_wins_over_the_conventional_build_directory() {
        let fixture = Fixture::new("root");
        fixture.write("compile_commands.json", &database(""));
        fixture.write("build/compile_commands.json", &database(""));
        assert_eq!(
            locate_database(&fixture.root(), &fixture.root()),
            Some(fixture.root())
        );
    }

    #[test]
    fn the_detected_build_root_wins() {
        let fixture = Fixture::new("detected");
        fixture.write("compile_commands.json", &database(""));
        fixture.write("out/compile_commands.json", &database(""));
        assert_eq!(
            locate_database(&fixture.root(), &fixture.root().join("out")),
            Some(fixture.root().join("out"))
        );
    }

    #[test]
    fn a_preset_binary_directory_is_found_by_the_scan() {
        let fixture = Fixture::new("preset");
        fixture.write("nested/preset-build/compile_commands.json", &database(""));
        assert_eq!(
            locate_database(&fixture.root(), &fixture.root()),
            Some(fixture.root().join("nested/preset-build"))
        );
    }

    #[test]
    fn a_project_without_a_database_reports_none() {
        let fixture = Fixture::new("absent");
        fixture.write("src/main.cpp", "int main() { return 0; }\n");
        assert_eq!(locate_database(&fixture.root(), &fixture.root()), None);
    }

    #[test]
    fn arguments_and_command_forms_both_parse() {
        let entries = read_entries_from(
            r#"[
                {"directory": "/p", "file": "/p/a.cpp", "arguments": ["c++", "-Iinc", "-c", "a.cpp"]},
                {"directory": "/p", "file": "/p/b c.cpp", "command": "c++ -I\"my dir\" -DB=2 -c \"b c.cpp\""}
            ]"#,
        );
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].argv.first().map(String::as_str), Some("c++"));
        assert_eq!(entries[1].argv[1], "-Imy dir");
    }

    /// The parser reads a file, so the fixture writes one and this reads it back.
    fn read_entries_from(json: &str) -> Vec<CompileEntry> {
        let fixture = Fixture::new("parse");
        fixture.write("compile_commands.json", json);
        read_entries(&fixture.root().join(DATABASE_FILE))
    }

    #[test]
    fn a_quoted_command_keeps_one_argument_whole() {
        assert_eq!(
            split_command("clang++ -I\"two words\" -o out a.cpp"),
            vec!["clang++", "-Itwo words", "-o", "out", "a.cpp"]
        );
    }
}
