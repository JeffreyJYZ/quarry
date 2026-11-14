/**
 * The diagnostic shape the Rust build module parses, and the module read back to prove it still
 * says so.
 *
 * The build path is a module directory, so every file in it counts as the parser.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RUST_SOURCE_DIR = join(import.meta.dir, "..", "..", "src-tauri", "src", "build_task");

/** Shape the Rust parser expects: `path:line:column: severity: message`. */
export const SEVERITY_MARKERS = [
	": fatal error:",
	": error:",
	": warning:",
	": note:",
	": remark:",
];
export const SHAPE_RE = /^([^:]+):(\d+):(\d+):\s*(fatal error|error|warning|note|remark):\s*(.+)$/;

export interface Shape {
	path: string;
	line: number;
	column: number;
	severity: string;
	message: string;
}

export function parseShape(line: string): Shape | null {
	const m = SHAPE_RE.exec(line.trim());
	if (!m) return null;
	return {
		path: m[1],
		line: Number(m[2]),
		column: Number(m[3]),
		severity: m[4],
		message: m[5],
	};
}

/** The module directory as one blob of text: the parser lives in several files. */
export function readRustModule(dir: string): string {
	return readdirSync(dir)
		.filter((name) => name.endsWith(".rs"))
		.sort()
		.map((name) => readFileSync(join(dir, name), "utf8"))
		.join("\n");
}
