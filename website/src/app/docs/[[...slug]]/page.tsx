import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import { mdxComponents } from "~/components/mdx";
import { allSlugs, readDoc } from "~/lib/content";
import { mdxOptions } from "~/lib/mdx-options";

type Params = { slug?: string[] };

export function generateStaticParams(): Params[] {
	return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
	const { slug } = await params;
	const doc = readDoc(slug);
	if (doc === null) return {};
	return { title: doc.meta.title, description: doc.meta.description };
}

/** One docs page: the MDX is compiled on the server at build time, so the export stays static. */
export default async function DocsPage({ params }: { params: Promise<Params> }) {
	const { slug } = await params;
	const doc = readDoc(slug);
	if (doc === null) notFound();

	const { content } = await compileMDX({
		source: doc.source,
		components: mdxComponents,
		options: { mdxOptions },
	});

	return content;
}
