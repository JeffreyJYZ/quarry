//! The one configure a clangd session runs, through the project's own model.
//!
//! The hand-off used to keep a second configure of its own: `plan.configure` for a tree the plan
//! named, and a bare `-S … -B … -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` recipe for anything else. It
//! wrote no file API query and synthesised no database, so a generator that writes none (Xcode,
//! Visual Studio, Ninja Multi-Config) left clangd with nothing to read — and the database fallback
//! in `database.rs` configured a second `build/` tree purely to have something. The configure
//! sequence now lives in `build_task::cmake_model::configure`, which the build runs too, so the two
//! consumers cannot describe a tree differently.
//!
//! What stays here is what only a language-server start needs: the deadline, so a broken toolchain
//! cannot hold the session open, and the process-wide slot, so two change batches cannot configure
//! one tree at once.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::{Command, Stdio};
pub use std::thread;
pub use std::time::{Duration, Instant};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use crate::build_task::{
    CMAKE_CACHE, CMAKE_PROGRAM, CmakeOptions, CmakePlan, ConfigureIntent, ConfigureRequest,
    ConfigureRun, DATABASE_FILE, cmake_plan, configure_need, configure_tree, synthesize_database,
};

use super::*;

/// A configure that has produced nothing after this long is treated as a failure, so a broken
/// toolchain cannot hold a language-server start open.
pub const CONFIGURE_TIMEOUT: Duration = Duration::from_secs(60);

/// The plan's build type flag, which a tree that already has one must not be reconfigured with.
pub const BUILD_TYPE_FLAG: &str = "-DCMAKE_BUILD_TYPE=";

/// Make the plan's own tree hold a compiler database, and say whether one is readable afterwards.
///
/// The model decides whether a configure is needed at all: a tree whose last configure read every
/// input unchanged is current, and it is not configured again merely because a session started. A
/// generator that writes `compile_commands.json` itself leaves its own file authoritative; one that
/// writes none gets the database synthesised from the file API, in the tree the plan names, so
/// `--compile-commands-dir` points at that tree and nowhere else. A failed configure is not an
/// error to the session: the previous database stays in place where there is one, and the session
/// starts either way.
pub fn ensure_database(root: &Path, plan: &CmakePlan) -> bool {
    let _guard = configure_lock();
    let database = plan.build_root.join(DATABASE_FILE);
    if configure_need(root, &plan.build_root, &handoff_intent(plan)).is_some() {
        let argv = configure_argv(plan);
        let request = ConfigureRequest {
            build_root: &plan.build_root,
            argv: &argv,
            // A tree that already holds a database keeps it when this configure fails.
            had_previous: database.is_file(),
        };
        // The reason is the session's to ignore: it starts against whatever is on disk.
        let _ = configure_tree(request, |argv| bounded_configure(root, argv));
    } else if !database.is_file() {
        // The reply is current, so only the derived file is missing: synthesise from the model
        // rather than pay for a configure that would produce the same reply.
        let _ = synthesize_database(&plan.build_root);
    }
    database.is_file()
}

/// Reconfigure when the session's database no longer describes the tree.
///
/// Called for a watched manifest edit. True when the database is current afterwards, so the caller
/// reports the regenerated file to clangd; a tree the plan no longer names is left alone rather
/// than reconfigured through a recipe it never chose.
pub fn refresh(root: &Path, database_dir: &Path) -> bool {
    let Ok(plan) = cmake_plan(root, false, &CmakeOptions::for_root(root)) else {
        return false;
    };
    if plan.build_root != database_dir {
        return false;
    }
    ensure_database(root, &plan)
}

/// What the hand-off asks a configure to carry: the plan's toolchain, and no build type.
///
/// Reconfiguring an existing Release tree to export a database must not flip it to Debug, so the
/// build type a build would force is left out of the comparison as well as the command line.
fn handoff_intent(plan: &CmakePlan) -> ConfigureIntent {
    ConfigureIntent {
        toolchain: plan.intent.toolchain.clone(),
        build_type: None,
    }
}

/// The plan's configure, minus a build type for a directory that already has one.
pub fn configure_argv(plan: &CmakePlan) -> Vec<String> {
    if !plan.build_root.join(CMAKE_CACHE).is_file() {
        return plan.configure.clone();
    }
    plan.configure
        .iter()
        .filter(|arg| !arg.starts_with(BUILD_TYPE_FLAG))
        .cloned()
        .collect()
}

/// Run the plan's configure under the deadline, capturing stderr only.
fn bounded_configure(root: &Path, argv: &[String]) -> Result<ConfigureRun, String> {
    let mut command = crate::resolve::command(CMAKE_PROGRAM)?;
    command
        .args(argv.get(1..).unwrap_or_default())
        // Both argv run from the project root: `--preset` is looked up against the working directory.
        .current_dir(root)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let outcome = run_bounded(command, CONFIGURE_TIMEOUT)?;
    Ok(ConfigureRun {
        success: outcome.success,
        stopped: false,
        text: outcome.text,
    })
}

/// The process-wide configure slot, so two change batches cannot configure one tree at once.
fn configure_lock() -> std::sync::MutexGuard<'static, ()> {
    static SLOT: std::sync::Mutex<()> = std::sync::Mutex::new(());
    SLOT.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// What a bounded run reported.
pub struct Bounded {
    pub success: bool,
    pub text: String,
}

/// Run a command with a deadline, capturing stderr.
///
/// `Command::output` waits forever, and a configure that blocks on a missing toolchain would keep a
/// language server from ever starting. The child is killed at the deadline; its stderr is read on its
/// own thread so a chatty configure cannot fill the pipe and deadlock.
pub fn run_bounded(mut command: Command, timeout: Duration) -> Result<Bounded, String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run cmake: {error}"))?;
    let stderr = child.stderr.take();
    let reader = thread::spawn(move || {
        use std::io::Read;
        let mut text = String::new();
        if let Some(mut pipe) = stderr {
            let _ = pipe.read_to_string(&mut text);
        }
        text
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break None,
        }
    };
    let text = reader.join().unwrap_or_default();
    let success = status.is_some_and(|status| status.success());
    if status.is_none() {
        return Err(format!(
            "cmake configure timed out after {}s",
            timeout.as_secs()
        ));
    }
    Ok(Bounded { success, text })
}
