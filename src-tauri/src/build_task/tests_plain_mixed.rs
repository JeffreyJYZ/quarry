#![allow(unused_imports)]

//! A plain project holding both C and C++: one command per language, then one link.

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use std::path::Path;
pub use std::process::Command;

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
            "quarry-plain-mixed-{label}-{}-{unique}",
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

    /// A C file that only C accepts, and a C++ file that calls it through `extern "C"`.
    fn mixed_project(root: &Path) {
        write(
            root,
            "include/mix.h",
            "#pragma once\n#ifdef __cplusplus\nextern \"C\" {\n#endif\nint mix_value(int seed);\n#ifdef __cplusplus\n}\n#endif\n",
        );
        write(
            root,
            "mix.c",
            "#include <stdlib.h>\n#include <mix.h>\n\nint mix_value(int seed) {\n\tint *values = malloc(sizeof(int));\n\tvalues[0] = seed;\n\tint result = values[0];\n\tfree(values);\n\treturn result;\n}\n",
        );
        write(
            root,
            "main.cpp",
            "#include <mix.h>\n#include <iostream>\n\nint main() {\n\tstd::cout << \"mix=\" << mix_value(21) << \"\\n\";\n\treturn 0;\n}\n",
        );
    }

    #[test]
    fn each_language_gets_its_own_command_and_the_database_says_so() {
        if crate::resolve::resolve("clang").is_none()
            || crate::resolve::resolve("clang++").is_none()
        {
            return;
        }
        let root = scratch("commands");
        mixed_project(&root);
        let path = root.display().to_string();

        let plan = plain_build_plan(&path, "app").expect("the product plans a plain build");
        let compile = |suffix: &str| -> Vec<String> {
            plan.commands
                .iter()
                .map(|step| step.argv.clone())
                .find(|argv| {
                    argv.contains(&"-c".to_string()) && argv.iter().any(|arg| arg.ends_with(suffix))
                })
                .unwrap_or_else(|| panic!("no compile command for {suffix}: {:?}", plan.commands))
        };
        assert_eq!(
            plan.commands.len(),
            3,
            "one compile per language, then the link: {:?}",
            plan.commands
        );
        let c = compile("mix.c");
        assert!(
            c[0].ends_with("clang") && !c[0].ends_with("clang++"),
            "the .c file needs the C driver: {c:?}"
        );
        assert!(c.contains(&"-std=c17".to_string()), "{c:?}");
        assert!(
            !c.iter().any(|arg| arg.starts_with("-std=c++")),
            "a C file never gets a C++ standard: {c:?}"
        );
        let cxx = compile("main.cpp");
        assert!(
            cxx[0].ends_with("clang++"),
            "the .cpp file needs the C++ driver: {cxx:?}"
        );
        assert!(cxx.contains(&"-std=c++20".to_string()), "{cxx:?}");
        let links: Vec<&Vec<String>> = plan
            .commands
            .iter()
            .map(|step| &step.argv)
            .filter(|argv| !argv.contains(&"-c".to_string()))
            .collect();
        assert_eq!(links.len(), 1, "one link: {:?}", plan.commands);
        assert!(
            links[0].iter().any(|arg| arg.ends_with("main.cpp.o"))
                && links[0].iter().any(|arg| arg.ends_with("mix.c.o")),
            "the link joins the objects: {:?}",
            links[0]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_build_links_across_the_boundary_and_writes_a_per_language_database() {
        if crate::resolve::resolve("clang").is_none()
            || crate::resolve::resolve("clang++").is_none()
        {
            return;
        }
        let root = scratch("build");
        mixed_project(&root);
        let path = root.display().to_string();

        let report =
            run_plain_clang_build(&BuildState::default(), &path, "app").expect("the build runs");

        assert!(report.success, "a mixed project builds: {}", report.summary);
        let database = root
            .join(crate::build_task::QUARRY_BUILD_DIR)
            .join(crate::project::DATABASE_FILE);
        let text = fs::read_to_string(&database).expect("the analysis gets the build's commands");
        let entries: Vec<serde_json::Value> =
            serde_json::from_str(&text).expect("the database is a JSON array");
        let arguments = |suffix: &str| -> Vec<String> {
            let entry = entries
                .iter()
                .find(|entry| {
                    entry["file"]
                        .as_str()
                        .is_some_and(|file| file.ends_with(suffix))
                })
                .unwrap_or_else(|| panic!("no {suffix} entry in {text}"));
            entry["arguments"]
                .as_array()
                .expect("arguments")
                .iter()
                .map(|arg| arg.as_str().unwrap_or_default().to_string())
                .collect()
        };
        let c = arguments("mix.c");
        assert!(
            c[0].ends_with("clang") && !c[0].ends_with("clang++"),
            "the C entry uses the C driver: {c:?}"
        );
        assert!(
            c.contains(&"-std=c17".to_string()),
            "and the C standard: {c:?}"
        );
        assert!(
            !c.iter().any(|arg| arg.starts_with("-std=c++")),
            "and never a C++ one: {c:?}"
        );
        let cxx = arguments("main.cpp");
        assert!(cxx[0].ends_with("clang++"), "the C++ entry: {cxx:?}");
        assert!(cxx.contains(&"-std=c++20".to_string()), "{cxx:?}");
        let _ = fs::remove_dir_all(&root);
    }
}
