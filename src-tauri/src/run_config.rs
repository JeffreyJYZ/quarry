//! Launch presets from `.quarry/launch.json`.
//!
//! Reads, writes and resolves presets and never writes outside `<root>/.quarry/`: the file name is a
//! constant, so the only directory that can be created or overwritten is that one. Relative `program`
//! and `cwd` resolve against the project root, a missing file is a project without presets rather than
//! an error, and a malformed file reports the absolute path with serde's line and column. Nothing here
//! shells out and a read never creates the file.

use crate::types::{LaunchConfig, LaunchFile};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

const LAUNCH_DIR: &str = ".quarry";
const LAUNCH_FILE_NAME: &str = "launch.json";

#[tauri::command]
pub async fn read_launch_config(root: String) -> Result<LaunchFile, String> {
    read(&root)
}

#[tauri::command]
pub async fn write_launch_config(root: String, file: LaunchFile) -> Result<String, String> {
    write(&root, &file)
}

/// Turn the named preset into a runtime `LaunchConfig` with absolute paths.
#[tauri::command]
pub async fn resolve_launch_config(root: String, name: String) -> Result<LaunchConfig, String> {
    resolve(&root, &name)
}

/// Reads the presets, treating a missing file as a project with no presets.
fn read(root: &str) -> Result<LaunchFile, String> {
    load(root).map(|(_root, file)| file)
}

/// Serialises the presets, creating `<root>/.quarry/` when needed, and returns the file path.
fn write(root: &str, file: &LaunchFile) -> Result<String, String> {
    let root = existing_root(root)?;
    let path = config_path(&root);
    validate(file, &path)?;

    fs::create_dir_all(root.join(LAUNCH_DIR))
        .map_err(|error| format!("cannot create {}/{}: {error}", display(&root), LAUNCH_DIR))?;

    let mut json = serde_json::to_string_pretty(file).map_err(|error| {
        format!(
            "cannot serialise the launch configuration for {}: {error}",
            display(&path)
        )
    })?;
    json.push('\n');

    fs::write(&path, json).map_err(|error| format!("cannot write {}: {error}", display(&path)))?;
    Ok(display(&path))
}

/// Turns one preset into a runtime config, resolving relative paths against the project root.
fn resolve(root: &str, name: &str) -> Result<LaunchConfig, String> {
    let (root, file) = load(root)?;
    let path = config_path(&root);

    let Some(preset) = file
        .configurations
        .iter()
        .find(|preset| preset.name == name)
    else {
        return Err(unknown_preset(name, &file, &path));
    };

    let program = match preset.program.as_deref() {
        Some(program) if !program.trim().is_empty() => program.trim(),
        _ => {
            return Err(format!(
                "launch preset \"{}\" in {} has no program, so it cannot be launched as a debug target.",
                preset.name,
                display(&path)
            ));
        }
    };

    let cwd = match preset.cwd.as_deref() {
        Some(cwd) if !cwd.trim().is_empty() => resolve_against(&root, cwd.trim()),
        _ => root.clone(),
    };

    Ok(LaunchConfig {
        program: display(&resolve_against(&root, program)),
        args: preset.args.clone(),
        cwd: display(&cwd),
        stop_on_entry: preset.stop_on_entry,
        init_commands: preset.init_commands.clone(),
    })
}

/// Reads the file, returning the absolute project root alongside the presets.
fn load(root: &str) -> Result<(PathBuf, LaunchFile), String> {
    let root = absolute_root(root)?;
    let path = config_path(&root);

    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok((root, LaunchFile::default()));
        }
        Err(error) => {
            return Err(format!(
                "cannot read launch configuration {}: {error}",
                display(&path)
            ));
        }
    };

    let file = serde_json::from_str::<LaunchFile>(&text).map_err(|error| {
        format!(
            "launch configuration {} is not valid JSON: {error}",
            display(&path)
        )
    })?;
    Ok((root, file))
}

/// Rejects presets a picker could not tell apart, naming the offending preset name or position.
fn validate(file: &LaunchFile, path: &Path) -> Result<(), String> {
    for (index, preset) in file.configurations.iter().enumerate() {
        let name = preset.name.trim();
        if name.is_empty() {
            return Err(format!(
                "launch preset at position {} in {} has an empty name.",
                index + 1,
                display(path)
            ));
        }
        if file.configurations[..index]
            .iter()
            .any(|other| other.name.trim() == name)
        {
            return Err(format!(
                "launch preset name \"{name}\" appears twice in {}.",
                display(path)
            ));
        }
    }
    Ok(())
}

fn unknown_preset(name: &str, file: &LaunchFile, path: &Path) -> String {
    let names: Vec<&str> = file
        .configurations
        .iter()
        .map(|preset| preset.name.as_str())
        .filter(|name| !name.trim().is_empty())
        .collect();
    if names.is_empty() {
        return format!(
            "no launch preset named \"{name}\" exists in {}, which defines no presets.",
            display(path)
        );
    }
    format!(
        "no launch preset named \"{name}\" exists in {}; available presets: {}.",
        display(path),
        names.join(", ")
    )
}

fn resolve_against(root: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

fn config_path(root: &Path) -> PathBuf {
    root.join(LAUNCH_DIR).join(LAUNCH_FILE_NAME)
}

/// Absolute project root, canonicalised when it exists so reported paths never depend on the cwd.
fn absolute_root(root: &str) -> Result<PathBuf, String> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return Err("the project root is empty.".to_string());
    }

    let path = Path::new(trimmed);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("cannot resolve the current directory: {error}"))?
            .join(path)
    };
    Ok(absolute.canonicalize().unwrap_or(absolute))
}

/// The root a write may create `.quarry/` under, which must already be a directory.
fn existing_root(root: &str) -> Result<PathBuf, String> {
    let root = absolute_root(root)?;
    if !root.is_dir() {
        return Err(format!(
            "cannot write a launch configuration because {} is not an existing directory.",
            display(&root)
        ));
    }
    Ok(root)
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::LaunchPreset;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway project root under the system temp dir, removed on drop.
    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-launch-{label}-{}-{unique}",
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

        fn read(&self, name: &str) -> String {
            fs::read_to_string(self.path.join(name)).expect("read fixture file")
        }

        /// Canonical path, which is what the module reports on macOS (temp dir is a symlink).
        fn root(&self) -> String {
            self.path
                .canonicalize()
                .expect("canonicalize fixture")
                .to_string_lossy()
                .into_owned()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn preset(name: &str) -> LaunchPreset {
        LaunchPreset {
            name: name.to_string(),
            program: Some("target/debug/app".to_string()),
            args: Vec::new(),
            cwd: None,
            build: None,
            stop_on_entry: false,
            init_commands: Vec::new(),
        }
    }

    fn json(presets: &str) -> String {
        format!("{{ \"configurations\": [{presets}] }}\n")
    }

    #[test]
    fn a_missing_file_is_an_empty_launch_file() {
        let fixture = Fixture::new("missing");
        let root = fixture.root();

        let file = read(&root).expect("a project without presets is normal");

        assert!(file.configurations.is_empty());
        assert!(
            !fixture
                .path
                .join(LAUNCH_DIR)
                .join(LAUNCH_FILE_NAME)
                .exists(),
            "a read must not create the file"
        );
    }

    #[test]
    fn a_file_without_configurations_parses_as_empty() {
        let fixture = Fixture::new("bare");
        fixture.write(".quarry/launch.json", "{}\n");

        let file = read(&fixture.root()).expect("missing key defaults to empty");

        assert!(file.configurations.is_empty());
    }

    #[test]
    fn a_malformed_file_names_the_path_and_position() {
        let fixture = Fixture::new("malformed");
        fixture.write(".quarry/launch.json", "{\n  \"configurations\": [\n");
        let root = fixture.root();

        let error = read(&root).expect_err("truncated JSON must fail");

        let expected = Path::new(&root)
            .join(LAUNCH_DIR)
            .join(LAUNCH_FILE_NAME)
            .to_string_lossy()
            .into_owned();
        assert!(error.contains(&expected), "unexpected error: {error}");
        assert!(error.contains("line"), "error lacks a line: {error}");
        assert!(error.contains("column"), "error lacks a column: {error}");
    }

    #[test]
    fn a_relative_program_without_cwd_resolves_under_the_root() {
        let fixture = Fixture::new("relative");
        fixture.write(
            ".quarry/launch.json",
            &json(concat!(
                "{ \"name\": \"run\", ",
                "\"program\": \"target/debug/app\", ",
                "\"args\": [\"--flag\", \"value\"], ",
                "\"stopOnEntry\": true, ",
                "\"initCommands\": [\"command script import /tmp/lldb_lookup.py\"] }",
            )),
        );
        let root = fixture.root();

        let config = resolve(&root, "run").expect("preset resolves");

        let expected_program = Path::new(&root)
            .join("target")
            .join("debug")
            .join("app")
            .to_string_lossy()
            .into_owned();
        assert!(
            Path::new(&config.program).is_absolute(),
            "{}",
            config.program
        );
        assert_eq!(config.program, expected_program);
        assert_eq!(config.cwd, root);
        assert_eq!(config.args, vec!["--flag".to_string(), "value".to_string()]);
        assert!(config.stop_on_entry);
        assert_eq!(
            config.init_commands,
            vec!["command script import /tmp/lldb_lookup.py".to_string()]
        );
    }

    #[test]
    fn an_absolute_program_and_relative_cwd_keep_their_meaning() {
        let fixture = Fixture::new("absolute");
        fixture.write(
            ".quarry/launch.json",
            &json("{ \"name\": \"run\", \"program\": \"/usr/bin/true\", \"cwd\": \"crates/app\" }"),
        );
        let root = fixture.root();

        let config = resolve(&root, "run").expect("preset resolves");

        assert_eq!(config.program, "/usr/bin/true");
        assert_eq!(
            config.cwd,
            Path::new(&root)
                .join("crates")
                .join("app")
                .to_string_lossy()
                .into_owned()
        );
    }

    #[test]
    fn an_unknown_preset_lists_the_available_names() {
        let fixture = Fixture::new("unknown");
        fixture.write(
            ".quarry/launch.json",
            &json("{ \"name\": \"first\", \"program\": \"a\" }, { \"name\": \"second\" }"),
        );

        let error = resolve(&fixture.root(), "third").expect_err("unknown preset must fail");

        assert!(error.contains("third"), "unexpected error: {error}");
        assert!(error.contains("first"), "unexpected error: {error}");
        assert!(error.contains("second"), "unexpected error: {error}");
    }

    #[test]
    fn a_preset_without_a_program_cannot_be_launched() {
        let fixture = Fixture::new("no-program");
        fixture.write(
            ".quarry/launch.json",
            &json("{ \"name\": \"build-only\", \"build\": \"cargo build\" }"),
        );

        let error = resolve(&fixture.root(), "build-only").expect_err("program is required");

        assert!(error.contains("build-only"), "unexpected error: {error}");
        assert!(error.contains("program"), "unexpected error: {error}");
    }

    #[test]
    fn write_then_read_round_trips_with_two_space_indentation() {
        let fixture = Fixture::new("roundtrip");
        let root = fixture.root();
        let file = LaunchFile {
            configurations: vec![LaunchPreset {
                name: "run".to_string(),
                program: Some("target/debug/app".to_string()),
                args: vec!["--verbose".to_string()],
                cwd: Some("crates/app".to_string()),
                build: Some("cargo build".to_string()),
                stop_on_entry: true,
                init_commands: vec!["command script import /tmp/lldb_lookup.py".to_string()],
            }],
        };

        let written = write(&root, &file).expect("write succeeds");

        let expected = Path::new(&root)
            .join(LAUNCH_DIR)
            .join(LAUNCH_FILE_NAME)
            .to_string_lossy()
            .into_owned();
        assert_eq!(written, expected);

        let text = fixture.read(".quarry/launch.json");
        assert!(text.ends_with('\n'), "no trailing newline: {text:?}");
        assert!(!text.ends_with("\n\n"), "more than one trailing newline");
        assert!(
            text.contains("\n  \"configurations\": [\n"),
            "top level is not two-space indented: {text}"
        );
        assert!(
            text.contains("\n    {\n"),
            "preset fields are not four-space indented: {text}"
        );

        let back = read(&root).expect("read back");
        assert_eq!(back.configurations.len(), 1);
        let preset = &back.configurations[0];
        assert_eq!(preset.name, "run");
        assert_eq!(preset.program.as_deref(), Some("target/debug/app"));
        assert_eq!(preset.args, vec!["--verbose".to_string()]);
        assert_eq!(preset.cwd.as_deref(), Some("crates/app"));
        assert_eq!(preset.build.as_deref(), Some("cargo build"));
        assert!(preset.stop_on_entry);
        assert_eq!(
            preset.init_commands,
            vec!["command script import /tmp/lldb_lookup.py".to_string()]
        );
    }

    #[test]
    fn a_duplicate_preset_name_is_rejected() {
        let fixture = Fixture::new("duplicate");
        let root = fixture.root();
        let file = LaunchFile {
            configurations: vec![preset("run"), preset("run")],
        };

        let error = write(&root, &file).expect_err("duplicate names must fail");

        assert!(error.contains("\"run\""), "unexpected error: {error}");
        assert!(
            !fixture
                .path
                .join(LAUNCH_DIR)
                .join(LAUNCH_FILE_NAME)
                .exists(),
            "a rejected file must not be written"
        );
    }

    #[test]
    fn an_empty_preset_name_is_rejected() {
        let fixture = Fixture::new("empty-name");
        let root = fixture.root();
        let file = LaunchFile {
            configurations: vec![preset("  ")],
        };

        let error = write(&root, &file).expect_err("empty names must fail");

        assert!(error.contains("empty name"), "unexpected error: {error}");
        assert!(
            !fixture
                .path
                .join(LAUNCH_DIR)
                .join(LAUNCH_FILE_NAME)
                .exists(),
            "a rejected file must not be written"
        );
    }

    #[test]
    fn a_root_that_is_not_a_directory_is_rejected() {
        let fixture = Fixture::new("bad-root");
        let missing = fixture.path.join("does-not-exist");

        let error = write(&missing.to_string_lossy(), &LaunchFile::default())
            .expect_err("a missing root must fail");

        assert!(
            error.contains("does-not-exist"),
            "unexpected error: {error}"
        );
        assert!(!missing.exists(), "the root must not be created");
    }
}
