#![allow(unused_imports)]

pub use std::path::Path;

use super::*;

/// The shell a new terminal starts.
///
/// `SHELL` first, because that is the user's own choice on every unix. Windows has no `/bin/zsh` and
/// usually no `SHELL`, so the previous fallback meant the terminal could never open there — the app
/// builds and ships a Windows bundle, so this was a dead feature on that platform rather than a
/// cosmetic default.
pub fn shell_from(get: impl Fn(&str) -> Option<String>, windows: bool) -> String {
    if let Some(shell) = get("SHELL").filter(|value| !value.trim().is_empty()) {
        return shell;
    }
    if windows {
        return get("COMSPEC")
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "cmd.exe".to_string());
    }
    "/bin/zsh".to_string()
}

/// The shell for this process.
pub fn shell_program() -> String {
    shell_from(|key| std::env::var(key).ok(), cfg!(windows))
}

#[cfg(test)]
mod tests_shell_program {
    use super::*;

    fn get(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |key| {
            pairs
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| value.to_string())
        }
    }

    #[test]
    fn the_users_shell_wins_on_every_platform() {
        assert_eq!(
            shell_from(
                get(&[("SHELL", "/opt/homebrew/bin/fish"), ("COMSPEC", "x")]),
                false
            ),
            "/opt/homebrew/bin/fish"
        );
        assert_eq!(
            shell_from(get(&[("SHELL", "/usr/bin/bash"), ("COMSPEC", "x")]), true),
            "/usr/bin/bash"
        );
    }

    #[test]
    fn an_empty_shell_variable_falls_through() {
        assert_eq!(shell_from(get(&[("SHELL", "  ")]), false), "/bin/zsh");
    }

    #[test]
    fn windows_falls_back_to_comspec_then_cmd() {
        assert_eq!(
            shell_from(get(&[("COMSPEC", "C:\\Windows\\system32\\cmd.exe")]), true),
            "C:\\Windows\\system32\\cmd.exe"
        );
        assert_eq!(shell_from(get(&[]), true), "cmd.exe");
    }

    #[test]
    fn unix_falls_back_to_zsh() {
        assert_eq!(
            shell_from(get(&[("COMSPEC", "C:\\cmd.exe")]), false),
            "/bin/zsh"
        );
    }
}
