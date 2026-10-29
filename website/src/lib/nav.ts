export type NavPage = {
	/** The route, always ending without a slash except the docs index. */
	href: string;
	title: string;
	/** One line, shown on the landing page and in search results. */
	summary: string;
	/** The page's file under `src/app`, so "edit this page" needs no second table. */
	file: string;
};

export type NavGroup = { title: string; pages: NavPage[] };

/** The whole documentation tree: three groups, ordered the way the loop is learned. */
export const NAV: NavGroup[] = [
	{
		title: "Getting started",
		pages: [
			{
				href: "/docs",
				title: "Overview",
				summary: "What quarry is, what works today, and what it deliberately leaves out.",
				file: "docs",
			},
			{
				href: "/docs/install",
				title: "Install",
				summary:
					"Build the app from source on macOS and check that the toolchains are found.",
				file: "docs/install",
			},
			{
				href: "/docs/projects",
				title: "Projects",
				summary:
					"Open a folder, let quarry detect the build system, and restore the last session.",
				file: "docs/projects",
			},
		],
	},
	{
		title: "Using quarry",
		pages: [
			{
				href: "/docs/editor",
				title: "Editor",
				summary: "CodeMirror editing, search, multi-cursor, formatting and config files.",
				file: "docs/editor",
			},
			{
				href: "/docs/language-servers",
				title: "Language servers",
				summary:
					"rust-analyzer and clangd: hover, completion, navigation, rename and diagnostics.",
				file: "docs/language-servers",
			},
			{
				href: "/docs/build-run",
				title: "Build and run",
				summary: "cargo and CMake builds, profiles, run configurations and the terminal.",
				file: "docs/build-run",
			},
			{
				href: "/docs/debugging",
				title: "Debugging",
				summary: "lldb-dap sessions, breakpoints, frames, memory and disassembly.",
				file: "docs/debugging",
			},
			{
				href: "/docs/tests",
				title: "Tests",
				summary: "List, filter and run tests, and copy the failures out.",
				file: "docs/tests",
			},
			{
				href: "/docs/source-control",
				title: "Source control",
				summary: "Status, diffs, commits, branches, history and blame.",
				file: "docs/source-control",
			},
			{
				href: "/docs/settings",
				title: "Settings and themes",
				summary: "What is stored where, the built-in themes, and custom token files.",
				file: "docs/settings",
			},
		],
	},
	{
		title: "Reference",
		pages: [
			{
				href: "/docs/shortcuts",
				title: "Keyboard shortcuts",
				summary:
					"Every accelerator the window answers to, grouped the way the sheet shows them.",
				file: "docs/shortcuts",
			},
			{
				href: "/docs/architecture",
				title: "Architecture",
				summary: "How the shell, the language servers and the debugger are wired together.",
				file: "docs/architecture",
			},
			{
				href: "/docs/contributing",
				title: "Contributing",
				summary: "The gate, the house rules, and how a change is proven before it lands.",
				file: "docs/contributing",
			},
		],
	},
];

export const PAGES: NavPage[] = NAV.flatMap((group) => group.pages);

export function pageFor(href: string): NavPage | undefined {
	const clean = href.endsWith("/") && href !== "/" ? href.slice(0, -1) : href;
	return PAGES.find((page) => page.href === clean);
}

/** The previous and next page in tree order, for the pager under the article. */
export function siblings(href: string): { previous?: NavPage; next?: NavPage } {
	const index = PAGES.findIndex((page) => page.href === href);
	if (index < 0) return {};
	return { previous: PAGES[index - 1], next: PAGES[index + 1] };
}
