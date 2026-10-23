/** A file icon by name: enough kinds to tell a source file from a manifest at a glance. */

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

const GLYPHS: Record<FileKind, string> = {
	rust: "M5 3.5 8 2l3 1.5v5L8 13l-3-1.5z",
	c: "M3 5.5 6.5 3l3.5 2v5L6.5 12 3 10z",
	cpp: "M3 5.5 6.5 3l3.5 2v5L6.5 12 3 10z",
	toml: "M3 6h7M3 9h7M5 4.5v7M8 4.5v7",
	json: "M6 3.5c-1.5 0-1.5 1-1.5 2.5S3.8 9 2.8 9c1 0 1.7 1 1.7 2.5S5 13 6 13M7 3.5c1.5 0 1.5 1 1.5 2.5S11.2 9 12.2 9c-1 0-1.7 1-1.7 2.5S10 13 9 13",
	markdown: "M2.5 4.5h11v6h-11zM4.5 6.5v3M4.5 9.5 6 8M4.5 9.5 3.5 8.5M10 6.5v2.5M9 8.5l1 1 1-1",
	lock: "M4.5 7V5.5a2 2 0 0 1 4 0V7M3.5 7h6v5h-6z",
	git: "M8 2v5M8 7c0 2-1 3-3.5 3M8 7c0 2 1 3 3.5 3",
	generic: "M3.5 2.5h5.5l3 3v7h-8.5zM9 2.5v3h3",
};

export default function FileTypeIcon({ name }: { name: string }) {
	const kind = fileKind(name);
	return (
		<svg
			className={`file-icon ${kind}`}
			width="12"
			height="12"
			viewBox="0 0 14 15"
			aria-hidden="true"
			focusable="false"
		>
			<path
				d={GLYPHS[kind]}
				fill={kind === "rust" || kind === "c" || kind === "cpp" ? "currentColor" : "none"}
				fillOpacity={kind === "rust" || kind === "c" || kind === "cpp" ? 0.18 : undefined}
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
