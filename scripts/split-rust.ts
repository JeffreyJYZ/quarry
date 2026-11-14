/**
 * Splits a Rust source file into a module directory, cutting only between top-level items.
 *
 * `foo.rs` becomes `foo/mod.rs` plus `foo/<name>.rs` children. Every child starts with
 * `#![allow(unused_imports)]`, the parent's imports, and `use super::*;`, so it sees the same names.
 * Items are widened to `pub` (fields to `pub(crate)`) so siblings and the re-exports can reach them,
 * and `mod.rs` re-exports each child with `pub use child::*;`, so every existing `crate::foo::X`
 * path keeps working.
 *
 * Items larger than the limit are expanded first: an `impl` block becomes several `impl` blocks for
 * the same type (legal Rust), and an inline `mod tests { ... }` becomes several numbered test
 * modules. A single function that large is reported instead of being cut.
 *
 * The work lives in `split-rust/`; this file is the entry point and nothing else.
 *
 * Usage: bun scripts/split-rust.ts src-tauri/src/foo.rs [--dry]
 */

import { splitFile } from "./split-rust/run";

export { expand } from "./split-rust/expand";
export { parse, splitItems } from "./split-rust/items";

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const isMain = import.meta.main;
if (files.length === 0) {
	if (isMain) {
		console.error("usage: bun scripts/split-rust.ts <file.rs> [...] [--dry]");
		process.exit(1);
	}
}

const options = {
	dry: process.argv.includes("--dry"),
	verbose: process.argv.includes("--verbose"),
};
let failures = 0;
for (const file of files) failures += splitFile(file, options);

if (failures > 0) process.exit(1);
