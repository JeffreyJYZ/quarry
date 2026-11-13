//! Captured replies and the directory a test needs to read one.
//!
//! The fixtures are real `cmake --graphviz`-era replies from cmake 4.4.5, trimmed to the fields a
//! reader touches and normalized to `/proj` so a test asserts a stable path. Every object keeps the
//! index/file split a real reply has, because resolving objects through the index is the behaviour
//! under test.

#![allow(dead_code)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use crate::test_support::TempDir;

use super::*;

// Single-config Ninja reply: one executable target, one include, one define, one fragment.
pub const SINGLE_INDEX: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/single/index-2026-11-13T06-01-10-0935.json"
);
pub const SINGLE_CODEMODEL: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/single/codemodel-v2-00000000000000000001.json"
);
pub const SINGLE_TARGET: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/single/target-demo-Debug-00000000000000000004.json"
);
pub const SINGLE_TOOLCHAINS: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/single/toolchains-v1-00000000000000000003.json"
);
pub const SINGLE_CMAKEFILES: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/single/cmakeFiles-v1-00000000000000000002.json"
);

// Multi-config Ninja reply: two configurations and three targets, one of them a library.
pub const MULTI_INDEX: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/index-2026-11-13T06-01-10-0935.json"
);
pub const MULTI_CODEMODEL: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/codemodel-v2-00000000000000000011.json"
);
pub const MULTI_TOOLCHAINS: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/toolchains-v1-00000000000000000012.json"
);
pub const MULTI_DEMO_DEBUG: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/target-demo_app-Debug-00000000000000000013.json"
);
pub const MULTI_HELPER_DEBUG: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/target-helper-Debug-00000000000000000014.json"
);
pub const MULTI_TOOL_DEBUG: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/target-tool-Debug-00000000000000000015.json"
);
pub const MULTI_DEMO_RELEASE: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/target-demo_app-Release-00000000000000000016.json"
);
pub const MULTI_HELPER_RELEASE: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/target-helper-Release-00000000000000000017.json"
);
pub const MULTI_TOOL_RELEASE: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/multi/target-tool-Release-00000000000000000018.json"
);

// An index that names a codemodel file the reply does not hold.
pub const BROKEN_INDEX: &str = include_str!(
    "../../../../tests/fixtures/cmake-reply/broken/index-2026-11-13T06-01-10-0935.json"
);

/// A build directory holding the single-target reply.
pub fn single(tag: &str) -> TempDir {
    write_reply(
        tag,
        &[
            ("index-2026-11-13T06-01-10-0935.json", SINGLE_INDEX),
            ("codemodel-v2-00000000000000000001.json", SINGLE_CODEMODEL),
            ("target-demo-Debug-00000000000000000004.json", SINGLE_TARGET),
            ("toolchains-v1-00000000000000000003.json", SINGLE_TOOLCHAINS),
            ("cmakeFiles-v1-00000000000000000002.json", SINGLE_CMAKEFILES),
        ],
    )
}

/// A build directory holding the multi-config reply.
pub fn multi(tag: &str) -> TempDir {
    write_reply(
        tag,
        &[
            ("index-2026-11-13T06-01-10-0935.json", MULTI_INDEX),
            ("codemodel-v2-00000000000000000011.json", MULTI_CODEMODEL),
            ("toolchains-v1-00000000000000000012.json", MULTI_TOOLCHAINS),
            (
                "target-demo_app-Debug-00000000000000000013.json",
                MULTI_DEMO_DEBUG,
            ),
            (
                "target-helper-Debug-00000000000000000014.json",
                MULTI_HELPER_DEBUG,
            ),
            (
                "target-tool-Debug-00000000000000000015.json",
                MULTI_TOOL_DEBUG,
            ),
            (
                "target-demo_app-Release-00000000000000000016.json",
                MULTI_DEMO_RELEASE,
            ),
            (
                "target-helper-Release-00000000000000000017.json",
                MULTI_HELPER_RELEASE,
            ),
            (
                "target-tool-Release-00000000000000000018.json",
                MULTI_TOOL_RELEASE,
            ),
        ],
    )
}

/// A build directory holding an index that references a file it does not have.
pub fn broken(tag: &str) -> TempDir {
    write_reply(
        tag,
        &[("index-2026-11-13T06-01-10-0935.json", BROKEN_INDEX)],
    )
}

/// A build directory with no reply at all, which is what a CMake older than the API leaves.
pub fn empty(tag: &str) -> TempDir {
    TempDir::new(tag)
}

/// Write each reply file below `<dir>/.cmake/api/v1/reply/`.
pub fn write_reply(tag: &str, files: &[(&str, &str)]) -> TempDir {
    let directory = TempDir::new(tag);
    let reply = reply_dir(directory.path());
    fs::create_dir_all(&reply).expect("reply directory");
    for (name, body) in files {
        fs::write(reply.join(name), body).expect("reply file");
    }
    directory
}
