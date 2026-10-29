/** Everything the shell needs to know about the product, in one place. */
export const SITE = {
	name: "quarry",
	tagline: "A focused IDE for Rust and C/C++",
	description:
		"quarry is a Tauri desktop IDE for Rust and C/C++ only: rust-analyzer and clangd for insight, lldb-dap for debugging, cargo and CMake for builds.",
	repo: "https://github.com/JeffreyJYZ/quarry",
	/** Inlined from the app's package.json by `next.config.ts`, so the pill never drifts. */
	version: process.env.QUARRY_VERSION ?? "0.0.0",
} as const;

/** The blob URL a page's "edit this page" link points at, from its file under `content/docs`. */
export function editUrl(file: string): string {
	const name = file.replace(/^docs\/?/, "") || "overview";
	return `${SITE.repo}/blob/main/website/content/docs/${name}.mdx`;
}
