#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

use super::*;

/// The choice between the target a build reported and the files it wrote.
///
/// The three cases below are the reason this is a function rather than a loop in the build: each
/// one is a way the wrong binary was launched, and none of them needs a build to reproduce.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_choice {
    use super::*;

    /// A build that reports its target is not overruled by a newer file it also wrote.
    ///
    /// The helper here stands in for the test binary or build script a build writes beside the app:
    /// newest-mtime alone picks it, and Run then launches something that is not the program.
    #[test]
    pub fn a_reported_artifact_beats_a_newer_binary() {
        let started_at = SystemTime::now();
        let candidates = [
            Candidate::new("/work/build/app", started_at + Duration::from_secs(1)),
            Candidate::new("/work/build/app_test", started_at + Duration::from_secs(9)),
        ];

        assert_eq!(
            choose_artifact(&candidates, started_at, Some("/work/build/app")).as_deref(),
            Some("/work/build/app")
        );
    }

    /// A file older than the build start belongs to an earlier build, however new it looks.
    #[test]
    pub fn an_artifact_older_than_the_build_start_is_not_chosen() {
        let started_at = SystemTime::now();
        let candidates = [Candidate::new(
            "/work/build/app",
            started_at - Duration::from_secs(30),
        )];

        assert_eq!(choose_artifact(&candidates, started_at, None), None);
    }

    /// Two files written in the same timestamp tick resolve by path, so the answer never wobbles.
    #[test]
    pub fn equal_times_resolve_to_one_artifact() {
        let started_at = SystemTime::now();
        let written = started_at + Duration::from_secs(3);
        let candidates = [
            Candidate::new("/work/build/zeta", written),
            Candidate::new("/work/build/alpha", written),
        ];

        assert_eq!(
            choose_artifact(&candidates, started_at, None).as_deref(),
            Some("/work/build/alpha")
        );
    }

    /// A reported target with no path in it is no report, so the candidates still decide.
    #[test]
    pub fn a_blank_reported_artifact_falls_back_to_the_build_output() {
        let started_at = SystemTime::now();
        let candidates = [Candidate::new(
            "/work/build/app",
            started_at + Duration::from_secs(1),
        )];

        assert_eq!(
            choose_artifact(&candidates, started_at, Some("  ")).as_deref(),
            Some("/work/build/app")
        );
    }

    /// Nothing reported and nothing written this run is a result, not a reason to look further.
    #[test]
    pub fn an_empty_artifact_choice_is_none() {
        assert_eq!(choose_artifact(&[], SystemTime::now(), None), None);
    }
}
