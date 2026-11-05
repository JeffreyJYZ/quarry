/** File-type classification for a file name: kinds enough to tell a source file from a manifest at a glance. */

import { CPP_EXTENSIONS, RUST_EXTENSIONS, extensionOf } from "@/lib/consts/extensions";

export type FileKind =
	"rust" | "c" | "cpp" | "toml" | "json" | "markdown" | "lock" | "git" | "generic";

const EXTENSIONS: Record<string, FileKind> = {
	toml: "toml",
	json: "json",
	md: "markdown",
	markdown: "markdown",
	lock: "lock",
};
for (const extension of CPP_EXTENSIONS) {
	EXTENSIONS[extension] = extension === "c" || extension === "h" ? "c" : "cpp";
}
for (const extension of RUST_EXTENSIONS) {
	EXTENSIONS[extension] = "rust";
}

const NAMES: Record<string, FileKind> = {
	"cargo.toml": "toml",
	"cargo.lock": "lock",
	"package.json": "json",
	"tsconfig.json": "json",
	makefile: "generic",
	"cmakelists.txt": "generic",
	".gitignore": "git",
	".gitmodules": "git",
	"rust-toolchain.toml": "toml",
	"readme.md": "markdown",
};

/** The icon kind for a file name, or the nearest thing when the extension is unknown. */
export function fileKind(name: string): FileKind {
	const lower = name.toLowerCase();
	const named = NAMES[lower];
	if (named !== undefined) return named;
	if (lower === "build.rs") return "rust";
	const extension = extensionOf(lower);
	if (extension === "") return "generic";
	return EXTENSIONS[extension] ?? "generic";
}
