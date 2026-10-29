import { codeToHtml } from "shiki";
import type { Metadata } from "next";
import Link from "next/link";
import { PAGES } from "@/lib/nav";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
	title: `${SITE.name} — ${SITE.tagline}`,
	description: SITE.description,
};

const FEATURES = [
	{
		label: "Insight",
		title: "rust-analyzer and clangd, never bundled",
		body: "One server per kind per project root. Hover, completion, definition, references, rename, code actions, inlay hints, signature help and both type hierarchies come from the server the language already trusts.",
	},
	{
		label: "Debug",
		title: "One LLDB debugger for both languages",
		body: "Breakpoints with conditions and log messages, data breakpoints, frames and scopes, pinned watches, a paged hex memory view and disassembly — all over raw DAP against Xcode's lldb-dap.",
	},
	{
		label: "Build",
		title: "cargo, CMake and plain clang",
		body: "Cargo builds through --message-format=json so its diagnostics land in Problems. CMake projects configure and build, and a C/C++ file with no build system still compiles through clang.",
	},
	{
		label: "Edit",
		title: "CodeMirror 6 with the daily loop wired up",
		body: "Search in file and project, multi-cursor, format on save through rustfmt or clang-format, breadcrumbs, occurrences, blame, and TOML, JSON and YAML formatting for the config files beside the code.",
	},
	{
		label: "Git",
		title: "The repository, without leaving the window",
		body: "Status grouped by staged and unstaged, per-file and per-commit diffs, commit and amend, branch switching, history, discard with confirmation, and blame in the editor and in its own tab.",
	},
	{
		label: "Test",
		title: "Tests as a dock, not a terminal scroll",
		body: "List tests by binary, filter by result, run all or failed only, copy names, output or failures as path::test lines.",
	},
];

const SNIPPET = `use std::fmt::Result;

pub struct Hover {
    pub markdown: String,
}

impl Hover {
    pub fn render(&self) -> Result {
        write!(f, "{}", self.markdown)
    }
}`;

export default async function LandingPage() {
	const highlighted = await codeToHtml(SNIPPET, {
		lang: "rust",
		themes: { dark: "one-dark-pro", light: "one-light" },
	});

	return (
		<main id="content">
			<section className="hero">
				<div className="hero-grid">
					<div>
						<span className="hero-eyebrow">
							<span className="dot" />
							{SITE.version} · macOS
						</span>
						<h1>
							A focused IDE for <em>Rust</em> and <em>C/C++</em>.
						</h1>
						<p className="hero-lede">
							quarry is built around the loop you actually run every day: open a
							project, navigate it, read the errors, fix them, build, run a test,
							start the debugger, look at memory. clangd and rust-analyzer do the
							insight, lldb-dap does the debugging, and nothing else is in the way.
						</p>
						<div className="hero-actions">
							<Link className="button button-primary" href="/docs">
								Read the docs
							</Link>
							<Link className="button" href="/docs/install">
								Install from source
							</Link>
							<a className="button" href={SITE.repo} target="_blank" rel="noreferrer">
								View on GitHub
							</a>
						</div>
					</div>
					<div className="hero-shot" aria-hidden="true">
						<div className="hero-shot-bar">
							<i />
							<i />
							<i />
							<span className="hero-shot-title">hover.rs — quarry</span>
						</div>
						<div
							className="hero-shot-code"
							dangerouslySetInnerHTML={{ __html: highlighted }}
						/>
					</div>
				</div>
			</section>

			<section className="feature-section">
				<p className="feature-head">What is in the box</p>
				<div className="feature-grid">
					{FEATURES.map((feature) => (
						<article className="feature-card" key={feature.title}>
							<p className="label">{feature.label}</p>
							<h3>{feature.title}</h3>
							<p>{feature.body}</p>
						</article>
					))}
				</div>
			</section>

			<section className="feature-section">
				<p className="feature-head">Start here</p>
				<div className="feature-grid">
					{PAGES.slice(0, 6).map((page) => (
						<Link
							className="feature-card feature-link"
							key={page.href}
							href={page.href}
						>
							<h3>{page.title}</h3>
							<p>{page.summary}</p>
						</Link>
					))}
				</div>
			</section>
		</main>
	);
}
