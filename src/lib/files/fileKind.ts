/** File-type classification for a file name: kinds enough to tell a source file from a manifest at a glance. */

export type FileKind =
	"rust" | "c" | "cpp" | "toml" | "json" | "markdown" | "lock" | "git" | "generic";

const EXTENSIONS: Record<string, FileKind> = {
	rs: "rust",
	c: "c",
	h: "c",
	cc: "cpp",
	cpp: "cpp",
	cxx: "cpp",
	hh: "cpp",
	hpp: "cpp",
	hxx: "cpp",
	toml: "toml",
	json: "json",
	md: "markdown",
	markdown: "markdown",
	lock: "lock",
};

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
	const dot = lower.lastIndexOf(".");
	if (dot === -1) return "generic";
	return EXTENSIONS[lower.slice(dot + 1)] ?? "generic";
}
