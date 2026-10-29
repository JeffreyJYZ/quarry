import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGES } from "~/lib/nav";

const DIR = join(process.cwd(), "content/docs");

export type Frontmatter = { title: string; description: string };

/** The file for a route: `/docs` is `overview.mdx`, everything else is its own name. */
export function fileFor(slug: string[] | undefined): string {
	const id = slug === undefined || slug.length === 0 ? "overview" : slug.join("/");
	return join(DIR, `${id}.mdx`);
}

export function allSlugs(): string[][] {
	return readdirSync(DIR)
		.filter((name) => name.endsWith(".mdx"))
		.map((name) => name.replace(/\.mdx$/, ""))
		.map((name) => (name === "overview" ? [] : [name]));
}

/** Frontmatter is read here rather than by the MDX compiler, so metadata needs no second parse. */
export function frontmatter(source: string): Frontmatter {
	const block = /^---\n([\s\S]*?)\n---\n/.exec(source)?.[1] ?? "";
	const read = (key: string) =>
		new RegExp(`^${key}:\\s*(.+)$`, "m").exec(block)?.[1]?.trim() ?? "";
	return { title: read("title"), description: read("description") };
}

/** The page's source with its frontmatter removed, ready for the MDX compiler. */
export function body(source: string): string {
	return source.replace(/^---\n[\s\S]*?\n---\n/, "");
}

export function readDoc(slug: string[] | undefined): { source: string; meta: Frontmatter } | null {
	const file = fileFor(slug);
	try {
		const source = readFileSync(file, "utf8");
		return { source: body(source), meta: frontmatter(source) };
	} catch {
		return null;
	}
}

/** The title the sidebar shows, falling back to the file name when the nav has no entry. */
export function titleFor(slug: string[] | undefined): string {
	const id = slug === undefined || slug.length === 0 ? "docs" : `docs/${slug.join("/")}`;
	return PAGES.find((page) => page.file === id)?.title ?? "Docs";
}
