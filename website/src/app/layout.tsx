import type { Metadata } from "next";
import HeaderControls from "@/components/HeaderControls";
import SearchDialog from "@/components/SearchDialog";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: `${SITE.name} — ${SITE.tagline}`,
		template: `%s — ${SITE.name} docs`,
	},
	description: SITE.description,
	applicationName: SITE.name,
	keywords: [
		"quarry",
		"Rust IDE",
		"C++ IDE",
		"rust-analyzer",
		"clangd",
		"lldb",
		"Tauri",
		"CLion alternative",
	],
	authors: [{ name: "Yizhou Jiang" }],
	openGraph: {
		title: `${SITE.name} — ${SITE.tagline}`,
		description: SITE.description,
		type: "website",
	},
};

/**
 * The theme the boot script picked, written before first paint so a dark page never flashes light.
 * `localStorage` wins; otherwise the OS preference decides.
 */
const BOOT_SCRIPT = `(() => {
	try {
		const stored = localStorage.getItem("quarry-docs-theme");
		const dark = !window.matchMedia("(prefers-color-scheme: light)").matches;
		document.documentElement.dataset.theme = stored === "light" || stored === "dark" ? stored : dark ? "dark" : "light";
	} catch {
		document.documentElement.dataset.theme = "dark";
	}
})();`;

/** A magnifier with a quarry handle: the app icon's shape, cut down to mark size. */
function BrandMark() {
	return (
		<svg
			className="brand-mark"
			width="19"
			height="19"
			viewBox="0 0 1024 1024"
			aria-hidden="true"
		>
			<circle cx="500" cy="480" r="268" fill="none" stroke="currentColor" strokeWidth="120" />
			<line
				x1="612"
				y1="612"
				x2="806"
				y2="806"
				stroke="currentColor"
				strokeWidth="120"
				strokeLinecap="square"
				opacity="0.65"
			/>
		</svg>
	);
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
			</head>
			<body>
				<a className="sr-only" href="#content">
					Skip to content
				</a>
				<header className="site-header">
					<a className="brand" href="/" aria-label="quarry home">
						<BrandMark />
						<span className="brand-name">quarry</span>
						<span className="brand-version">{SITE.version}</span>
					</a>
					<a className="header-link" href="/docs">
						Docs
					</a>
					<span className="header-spacer" />
					<HeaderControls repo={SITE.repo} />
				</header>
				{children}
				<footer className="site-footer">
					<div className="site-footer-inner">
						<span>
							{SITE.name} is MIT licensed. Built with Tauri, React and CodeMirror.
						</span>
						<span className="dot">·</span>
						<a href="/docs">Documentation</a>
						<span className="dot">·</span>
						<a href={SITE.repo} target="_blank" rel="noreferrer">
							GitHub
						</a>
						<span className="dot">·</span>
						<a href={`${SITE.repo}/releases`} target="_blank" rel="noreferrer">
							Releases
						</a>
					</div>
				</footer>
				<SearchDialog />
			</body>
		</html>
	);
}
