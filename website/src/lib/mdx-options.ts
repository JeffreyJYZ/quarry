import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { Options as PrettyCodeOptions } from "rehype-pretty-code";
import type { PluggableList } from "unified";

const prettyCode: PrettyCodeOptions = {
	theme: { dark: "one-dark-pro", light: "one-light" },
	keepBackground: false,
	defaultLang: "text",
};

/**
 * The MDX pipeline: tables, heading anchors, and shiki with both app themes, so every token carries
 * a dark and a light colour and the stylesheet picks one.
 */
export const mdxOptions = {
	remarkPlugins: [remarkGfm] as PluggableList,
	rehypePlugins: [
		rehypeSlug,
		[rehypeAutolinkHeadings, { behavior: "wrap", properties: { className: "heading-anchor" } }],
		[rehypePrettyCode, prettyCode],
	] as PluggableList,
};
