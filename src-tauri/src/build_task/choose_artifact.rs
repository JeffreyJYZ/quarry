#![allow(unused_imports)]

pub use std::path::PathBuf;
pub use std::time::SystemTime;

/// One file a build could have produced, and when the build touched it.
///
/// The walk collects these without deciding anything: a build reports its timing once, and the
/// choice is made here so it can be tested without a filesystem.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Candidate {
    pub path: PathBuf,
    pub modified: SystemTime,
}

impl Candidate {
    pub fn new(path: impl Into<PathBuf>, modified: SystemTime) -> Self {
        Self {
            path: path.into(),
            modified,
        }
    }
}

/// The executable this build produced, from the target it reported and the files it touched.
///
/// Three rules, in order, and each one is the answer to a way the wrong binary used to be launched:
///
/// 1. A target the build system reported wins outright — `cargo` names the executable of the unit
///    it built, so a newer helper, test binary or build script written in the same run can never
///    take the launch away from it. It is also why a reported target's timestamp is not checked:
///    cargo reports a unit it considered `Fresh`, whose file predates the build.
/// 2. With nothing reported, the newest candidate the build wrote *at or after* `started_at` wins.
///    The comparison is against the build's own start time, not the file's age, so a binary from an
///    earlier build is not mistaken for this one however recently it was written.
/// 3. Equal times break by path, smallest first, so a filesystem with a coarse timestamp returns
///    the same answer on every run.
///
/// `None` means the build produced nothing to run, which is a result the caller reports rather than
/// a gap for a later step to guess at.
pub fn choose_artifact(
    candidates: &[Candidate],
    started_at: SystemTime,
    reported: Option<&str>,
) -> Option<String> {
    if let Some(reported) = reported.map(str::trim).filter(|path| !path.is_empty()) {
        return Some(reported.to_string());
    }

    candidates
        .iter()
        .filter(|candidate| candidate.modified >= started_at)
        .max_by(|left, right| {
            left.modified
                .cmp(&right.modified)
                .then_with(|| right.path.cmp(&left.path))
        })
        .map(|candidate| candidate.path.to_string_lossy().into_owned())
}
