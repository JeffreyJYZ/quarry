#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

use super::*;

/// The comparison itself, on trees whose timestamps are written rather than waited for.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_staleness {
    use super::*;
    use crate::test_support::TempDir;

    const CONFIGURED: u64 = 1_000;
    const LATER: u64 = 1_200;

    fn at(seconds: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(seconds)
    }

    fn write_at(path: &Path, content: &str, seconds: u64) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("fixture directory");
        }
        fs::write(path, content).expect("fixture file");
        let file = fs::File::options()
            .write(true)
            .open(path)
            .expect("fixture open");
        file.set_modified(at(seconds)).expect("fixture mtime");
    }

    /// A project whose last configure finished at [`CONFIGURED`] and read `inputs`.
    struct Tree {
        _dir: TempDir,
        root: PathBuf,
        build: PathBuf,
    }

    impl Tree {
        fn new(tag: &str, inputs: &[&str]) -> Self {
            let dir = TempDir::new(tag);
            let root = dir.path().canonicalize().expect("canonical root");
            let build = root.join(BUILD_DIR);
            fs::create_dir_all(&build).expect("build dir");
            write_at(&root.join(MANIFEST), "", 800);
            for path in inputs {
                write_at(&root.join(path), "", 800);
            }
            let reply = reply_dir(&build);
            let objects = inputs
                .iter()
                .map(|path| serde_json::json!({ "path": path }))
                .collect::<Vec<serde_json::Value>>();
            write_at(
                &reply.join("cmakeFiles-v1-1.json"),
                &serde_json::json!({ "inputs": objects }).to_string(),
                CONFIGURED,
            );
            write_at(
                &reply.join("index-2026-01-01T00-00-00-0000.json"),
                &index_body(),
                CONFIGURED,
            );
            write_at(&build.join(CMAKE_CACHE), "", CONFIGURED);
            Self {
                _dir: dir,
                root,
                build,
            }
        }

        fn need(&self, intent: &ConfigureIntent) -> Option<ConfigureNeed> {
            configure_need(&self.root, &self.build, intent)
        }
    }

    fn index_body() -> String {
        serde_json::json!({ "objects": [ {
            "kind": CMAKEFILES_KIND,
            "version": { "major": 1 },
            "jsonFile": "cmakeFiles-v1-1.json"
        } ] })
        .to_string()
    }

    fn changed(need: Option<ConfigureNeed>) -> String {
        match need {
            Some(ConfigureNeed::Changed(note)) => note,
            other => panic!("expected a reconfigure, got {other:?}"),
        }
    }

    #[test]
    fn an_unchanged_tree_needs_no_configure() {
        let tree = Tree::new("stale-current", &[MANIFEST]);
        assert_eq!(tree.need(&ConfigureIntent::default()), None);
    }

    #[test]
    fn a_changed_manifest_needs_a_configure() {
        let tree = Tree::new("stale-manifest", &[MANIFEST]);
        write_at(&tree.root.join(MANIFEST), "", LATER);
        let note = changed(tree.need(&ConfigureIntent::default()));
        assert!(note.contains(MANIFEST), "{note}");
        assert!(note.contains("configured again"), "{note}");
    }

    #[test]
    fn a_changed_preset_needs_a_configure() {
        let tree = Tree::new("stale-preset", &[MANIFEST]);
        write_at(&tree.root.join(PRESETS_FILE), "{}", LATER);
        let note = changed(tree.need(&ConfigureIntent::default()));
        assert!(note.contains(PRESETS_FILE), "{note}");
    }

    #[test]
    fn a_changed_toolchain_file_needs_a_configure() {
        let tree = Tree::new("stale-toolchain", &[MANIFEST]);
        let toolchain = tree.root.join("arm.cmake");
        write_at(&toolchain, "", LATER);
        let intent = ConfigureIntent {
            toolchain: Some(toolchain),
            build_type: None,
        };
        let note = changed(tree.need(&intent));
        assert!(note.contains("arm.cmake"), "{note}");
    }

    #[test]
    fn a_toolchain_the_cache_names_is_compared_even_when_the_plan_names_none() {
        let tree = Tree::new("stale-toolchain-cache", &[MANIFEST]);
        let toolchain = tree.root.join("toolchains").join("arm.cmake");
        write_at(&toolchain, "", LATER);
        write_at(
            &tree.build.join(CMAKE_CACHE),
            &format!("{}:FILEPATH={}\n", TOOLCHAIN_VARIABLE, toolchain.display()),
            CONFIGURED,
        );
        let note = changed(tree.need(&ConfigureIntent::default()));
        assert!(note.contains("arm.cmake"), "{note}");
    }

    #[test]
    fn a_nested_manifest_the_configure_read_needs_a_configure() {
        let tree = Tree::new("stale-nested", &[MANIFEST, "src/deep/CMakeLists.txt"]);
        let nested = tree.root.join("src").join("deep").join(MANIFEST);
        write_at(&nested, "", LATER);
        let note = changed(tree.need(&ConfigureIntent::default()));
        assert!(note.contains("src/deep/CMakeLists.txt"), "{note}");
    }

    #[test]
    fn a_manifest_the_configure_never_read_is_not_an_input() {
        let tree = Tree::new("stale-unrelated", &[MANIFEST]);
        write_at(&tree.root.join("vendor").join(MANIFEST), "", LATER);
        assert_eq!(tree.need(&ConfigureIntent::default()), None);
    }

    #[test]
    fn a_tree_with_a_cache_but_no_finished_configure_needs_a_configure() {
        let tree = Tree::new("stale-first", &[MANIFEST]);
        // The cache survives a configure that died before generating, and a wiped build directory;
        // only the reply proves one finished, so this tree is configured again.
        fs::remove_dir_all(reply_dir(&tree.build)).expect("no reply");
        assert_eq!(
            tree.need(&ConfigureIntent::default()),
            Some(ConfigureNeed::First)
        );
    }

    #[test]
    fn a_failed_configure_stays_stale_even_when_it_touched_the_cache() {
        let tree = Tree::new("stale-failure", &[MANIFEST]);
        // A configure that failed after writing the cache: only the index records success, and it
        // still names the configure before the manifest changed.
        write_at(&tree.build.join(CMAKE_CACHE), "", LATER);
        write_at(&tree.root.join(MANIFEST), "", LATER);
        changed(tree.need(&ConfigureIntent::default()));
    }

    #[test]
    fn a_build_type_the_tree_was_not_configured_for_needs_a_configure() {
        let tree = Tree::new("stale-build-type", &[MANIFEST]);
        write_at(
            &tree.build.join(CMAKE_CACHE),
            &format!("{}:STRING=Debug\n", BUILD_TYPE_VARIABLE),
            CONFIGURED,
        );
        let intent = ConfigureIntent {
            toolchain: None,
            build_type: Some("Release".to_string()),
        };
        let note = changed(tree.need(&intent));
        assert!(note.contains("Release"), "{note}");
    }
}
