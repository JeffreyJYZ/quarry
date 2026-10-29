/**
 * Builds `/search-index.json` from the docs pages.
 *
 * The palette is client-side, so it needs a plain index rather than a server. Every page contributes
 * one entry plus one per `h2`/`h3`, with the text under the heading flattened into one body line.
 * The index is derived from the same MDX the site ships, so a result can never name a heading the
 * page does not have.
 *
 * Usage: bun scripts/build-search.ts
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NAV, PAGES } from "../src/lib/nav";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "content/docs");
const OUT = join(ROOT, "public");

type Entry = { title: string; section: string; href: string; heading: string; body: string };

function mdxFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) mdxFiles(path, out);
		else if (name.endsWith(".mdx")) out.push(path);
	}
	return out;
}

/** MDX → the words a reader would see: no frontmatter, no JSX tags, no markdown punctuation. */
function plain(markdown: string): string[] {
	return markdown
		.replace(/^---\n[\s\S]*?\n---\n/, "")
		.replace(/^import .*$/gm, "")
		.replace(/^export const metadata[\s\S]*?^\};$/gm, "")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/<[^>]+>/g, " ")
		.split(/\n{2,}/)
		.map((block) =>
			block
				.replace(/(^|\n)\s*[-*+]\s+/g, "$1")
				.replace(/[*_`>]/g, "")
				.replace(/\|/g, " ")
				.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
				.replace(/[-\s]{4,}/g, " ")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter((block) => block !== "" && !/^[-:\s]+$/.test(block));
}

function routeFor(id: string): string {
	return id === "overview" ? "/docs" : `/docs/${id}`;
}

function sectionFor(file: string): string {
	return NAV.find((group) => group.pages.some((page) => page.file === file))?.title ?? "Docs";
}

const entries: Entry[] = [];

/** Nav order, so an empty query lists the docs the way the sidebar does. */
const order = new Map(PAGES.map((page, index) => [page.file, index]));
const idOf = (path: string) => relative(DOCS, path).replace(/\.mdx$/, "");
const fileIdOf = (path: string) => {
	const id = idOf(path);
	return id === "overview" ? "docs" : `docs/${id}`;
};
const files = mdxFiles(DOCS).sort(
	(a, b) => (order.get(fileIdOf(a)) ?? 999) - (order.get(fileIdOf(b)) ?? 999),
);

for (const file of files) {
	const id = idOf(file);
	const fileId = id === "overview" ? "docs" : `docs/${id}`;
	const page = PAGES.find((entry) => entry.file === fileId);
	const section = sectionFor(fileId);
	const blocks = plain(readFileSync(file, "utf8"));
	const heading = blocks.find((block) => block.startsWith("# "))?.slice(2) ?? page?.title ?? id;
	const body = blocks
		.filter((block) => !/^#{1,6}\s/.test(block))
		.join(" ")
		.slice(0, 800);

	entries.push({
		title: page?.title ?? heading,
		section,
		href: routeFor(id),
		heading,
		body,
	});

	let current = "";
	for (const block of blocks) {
		const match = /^(#{2,3})\s+(.*)$/.exec(block);
		if (match !== null) {
			current = match[2];
			continue;
		}
		if (current === "" || block.length < 40) continue;
		entries.push({
			title: page?.title ?? heading,
			section,
			href: routeFor(id),
			heading: current,
			body: block.slice(0, 800),
		});
	}
}

writeFileSync(join(OUT, "search-index.json"), `${JSON.stringify(entries, null, "\t")}\n`);
console.log(`search index: ${entries.length} entries from ${mdxFiles(DOCS).length} pages`);
