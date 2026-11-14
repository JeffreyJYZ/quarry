//! The plan a project would run, as data instead of as side effects.
//!
//! The C/C++ parity probe (`scripts/cpp-parity-probe.ts`) measures quarry against CLion by running
//! the product's own build and starting clangd with the product's own arguments. A probe that
//! re-derived those decisions in TypeScript would measure the probe, so this module asks the three
//! questions of the functions that already decide them — [`cmake_plan`] for the build tree and both
//! argv, [`plain_build_plan`] for a project with no build system, [`server_args`] for the clangd
//! hand-off, [`list_targets`]/[`resolve_target_in`] for the run dropdown — and
//! `src/bin/quarry-plan.rs` prints the answers as JSON.
//!
//! Reading it is not free of side effects, because the product is not: the hand-off configures a
//! CMake project that has no compiler database, and writes one for a plain C/C++ project, exactly as
//! opening that project does.

use std::path::Path;

use serde::Serialize;

use crate::build_task::{
    CMAKE_PROGRAM, CmakeOptions, PlainPlan, cmake_plan_target, external, plain_build_plan,
};
use crate::launch::cmake_build_target;
use crate::project::inspect;
use crate::types::ProjectKind;

mod targets;

/// Re-exported so a caller of this seam (the `quarry-plan` example) names the same type.
pub use crate::build_task::BuildProfile;

/// Everything one project would do, by consumer: build, analysis and run targets.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub kind: String,
    pub root: String,
    pub name: String,
    /// The build root the project model reports, before CMake detection refines it.
    pub build_root: String,
    pub cmake: Option<CmakeSection>,
    /// The build a project with no build system runs, which quarry compiles itself.
    pub plain: Option<PlainPlan>,
    pub targets: Vec<Target>,
    pub handoff: Option<Handoff>,
}

/// One CMake build: the tree, both argv, and what the model had to decide.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmakeSection {
    /// The cmake binary the product would spawn, or null when it cannot find one.
    pub program: Option<String>,
    /// The project's CMake settings, echoed so a caller sees what the plan was computed from.
    pub options: Options,
    /// The profile the plan was asked for, in the spelling the settings file uses.
    pub profile: String,
    /// The one target this build names, or null when it builds everything.
    pub target: Option<String>,
    pub build_root: String,
    /// Directory both argv run in: `run_cmake_build` uses the source root for both.
    pub cwd: String,
    /// Full argv, program first, exactly as `run_cmake_build` spawns it.
    pub configure: Vec<String>,
    pub build: Vec<String>,
    pub note: Option<String>,
}

/// What one plan is asked for: a profile, and one target or everything.
#[derive(Clone, Debug, Default)]
pub struct PlanRequest {
    pub profile: BuildProfile,
    /// A run-target id (`cpp:<name>`) or a bare CMake target name; `None` builds everything.
    pub target: Option<String>,
}

/// The CMake section of `.quarry/settings.json`; every value empty means "the project decides".
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub preset: String,
    pub build_dir: String,
    pub toolchain_file: String,
}

/// One row of the run dropdown, plus the program Run would launch for it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub target: String,
    /// The program `resolve_run_target` names: the artifact the next build writes, or the built one.
    pub program: Option<String>,
    /// The resolution error, when a listed id does not resolve.
    pub error: Option<String>,
}

/// What the language-server session hands clangd.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Handoff {
    pub server: String,
    /// The arguments the session spawns the server with, the user's own included.
    pub args: Vec<String>,
    /// The compile-database directory clangd was pointed at, when one was found or configured.
    pub database_dir: Option<String>,
    /// Why the session had to configure the tree, when it did; a start reports it once.
    pub note: Option<String>,
}

/// Ask the product what it would do with `root`, for one profile and one target selection.
pub fn project_plan(root: &str, request: &PlanRequest) -> Result<Plan, String> {
    let info = inspect(root)?;
    let source = Path::new(&info.root);
    let target = request.target.as_deref().and_then(cmake_build_target);
    let cmake = match info.kind {
        ProjectKind::Cmake => {
            let options = CmakeOptions::for_root(source);
            let plan = cmake_plan_target(source, request.profile, &options, target.as_deref())?;
            Some(CmakeSection {
                program: crate::resolve::resolve(CMAKE_PROGRAM).map(|found| external(&found.path)),
                options: Options {
                    preset: options.preset.clone(),
                    build_dir: options.build_dir.clone(),
                    toolchain_file: options.toolchain_file.clone(),
                },
                profile: request.profile.wire().to_string(),
                target,
                build_root: external(&plan.build_root),
                cwd: external(source),
                configure: plan.configure,
                build: plan.build,
                note: plan.note,
            })
        }
        _ => None,
    };

    // The plain build exists for the kinds quarry compiles itself; Cargo and CMake have their own.
    let plain = match info.kind {
        ProjectKind::Cargo | ProjectKind::Cmake => None,
        ProjectKind::CompileCommands | ProjectKind::Unknown => {
            plain_build_plan(&info.root, &info.name).ok()
        }
    };

    let targets = targets::plan_targets(&info.root, request.profile);

    // rust-analyzer has a manifest and needs no database, so only the C/C++ kinds are handed one.
    // The profile is the request's own: the plan the probe reads is the one that build would run,
    // and clangd is pointed at the tree configured with its flags.
    let handoff = match info.kind {
        ProjectKind::Cmake | ProjectKind::CompileCommands | ProjectKind::Unknown => {
            let handoff = crate::lsp::server_args("clangd", &info, &[], request.profile);
            Some(Handoff {
                server: "clangd".to_string(),
                args: handoff.args,
                database_dir: handoff.database.map(|dir| external(&dir)),
                note: handoff.note,
            })
        }
        _ => None,
    };

    Ok(Plan {
        kind: format!("{:?}", info.kind),
        root: external(source),
        name: info.name.clone(),
        build_root: external(Path::new(&info.build_root)),
        cmake,
        plain,
        targets,
        handoff,
    })
}
