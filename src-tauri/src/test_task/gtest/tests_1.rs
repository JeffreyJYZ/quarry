#![allow(unused_imports)]

pub use std::fs;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    /// One suite with three cases, then a second suite: the exact shape gtest prints.
    pub const TWO_SUITES: &str = concat!(
        "Running main() from gtest_main.cc\n",
        "MySuite.\n",
        "  DoesSomething\n",
        "  HandlesError\n",
        "  KeepsState\n",
        "OtherSuite.\n",
        "  Works\n",
    );

    #[test]
    pub fn parses_a_suite_with_several_tests() {
        let cases = parse_list("MySuite.\n  DoesSomething\n  HandlesError\n  KeepsState\n");

        assert_eq!(
            cases,
            [
                ("MySuite".to_string(), "DoesSomething".to_string()),
                ("MySuite".to_string(), "HandlesError".to_string()),
                ("MySuite".to_string(), "KeepsState".to_string()),
            ]
        );
        assert_eq!(full_name(&cases[0].0, &cases[0].1), "MySuite.DoesSomething");
    }

    #[test]
    pub fn parses_several_suites_and_skips_the_banner() {
        let names: Vec<String> = parse_list(TWO_SUITES)
            .into_iter()
            .map(|(suite, case)| full_name(&suite, &case))
            .collect();

        assert_eq!(
            names,
            [
                "MySuite.DoesSomething",
                "MySuite.HandlesError",
                "MySuite.KeepsState",
                "OtherSuite.Works",
            ]
        );
    }

    #[test]
    pub fn parses_a_typed_test_comment_without_making_it_a_case() {
        let cases = parse_list("Typed/0.  # TypeParam = int\n  Case\n");

        assert_eq!(cases, [("Typed/0".to_string(), "Case".to_string())]);
    }

    #[test]
    pub fn an_empty_or_banner_only_list_is_empty() {
        assert!(parse_list("").is_empty());
        assert!(parse_list("Running main() from gtest_main.cc\n").is_empty());
        assert!(parse_list("\n\n").is_empty());
    }

    #[test]
    pub fn a_non_gtest_banner_yields_no_cases() {
        let text = concat!(
            "Running main() from gtest_main.cc\n",
            "Unrecognized option: --gtest_list_tests\n",
        );

        assert!(parse_list(text).is_empty());
    }

    #[test]
    pub fn a_case_before_any_suite_is_dropped() {
        assert!(
            parse_list("  orphan\nMySuite.\n  Real\n")
                == [("MySuite".to_string(), "Real".to_string())]
        );
    }

    #[test]
    pub fn routes_on_the_name_shape() {
        assert!(looks_like_gtest("MySuite.DoesSomething"));
        assert!(!looks_like_gtest("tests::adds"));
        assert!(!looks_like_gtest("top_level_rust_test"));
        assert_eq!(
            split_name("MySuite.DoesSomething"),
            Some(("MySuite", "DoesSomething"))
        );
        assert_eq!(split_name("no_dot"), None);
        assert_eq!(split_name(".Leading"), None);
    }
}
