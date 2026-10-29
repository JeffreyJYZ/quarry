"use client";

import { useEffect, useState } from "react";

type Heading = { id: string; text: string; depth: number };

/**
 * The on-page headings, read from the rendered article.
 *
 * The content is MDX, so the ids are `rehype-slug`'s. Reading the DOM keeps the list and the
 * anchors from drifting apart, at the cost of rendering after mount — the column is reserved, so
 * nothing shifts.
 */
export default function Toc() {
	const [headings, setHeadings] = useState<Heading[]>([]);
	const [active, setActive] = useState("");

	useEffect(() => {
		const article = document.querySelector(".prose");
		if (article === null) return;
		const found = [...article.querySelectorAll<HTMLElement>("h2[id], h3[id]")].map((node) => ({
			id: node.id,
			text: node.textContent ?? "",
			depth: node.tagName === "H2" ? 2 : 3,
		}));
		setHeadings(found);
		if (found.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (visible !== undefined) setActive(visible.target.id);
			},
			{ rootMargin: "-72px 0px -70% 0px", threshold: 0 },
		);
		for (const heading of found) {
			const node = document.getElementById(heading.id);
			if (node !== null) observer.observe(node);
		}
		return () => observer.disconnect();
	}, []);

	if (headings.length === 0) return null;

	return (
		<nav className="toc" aria-label="On this page">
			<p className="label">On this page</p>
			<ul className="toc-list">
				{headings.map((heading) => (
					<li key={heading.id}>
						<a
							href={`#${heading.id}`}
							data-depth={heading.depth}
							className={active === heading.id ? "active" : undefined}
						>
							{heading.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
