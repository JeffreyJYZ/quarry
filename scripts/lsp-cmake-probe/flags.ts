/**
 * The flag names must be the ones the product composes, so they are read back from the Rust source
 * rather than written twice.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function productFlags(root: string): { dir: string; driver: string } {
	const compose = readFileSync(
		join(root, "src-tauri", "src", "lsp", "handoff", "compose.rs"),
		"utf8",
	);
	const flag = (name: string): string => {
		const match = new RegExp(`pub const ${name}: &str = "(--[a-z-]+)";`).exec(compose);
		if (match === null)
			throw new Error(`${name} is not declared in src/lsp/handoff/compose.rs`);
		return match[1];
	};
	return { dir: flag("COMPILE_COMMANDS_DIR"), driver: flag("QUERY_DRIVER") };
}
