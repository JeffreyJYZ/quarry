"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalise } from "@/components/Sidebar";
import { NAV, pageFor, siblings } from "@/lib/nav";
import { editUrl, SITE } from "@/lib/site";

/** Breadcrumbs, the edit link and the previous/next pager: everything that needs the current route. */
export default function DocFooter() {
	const pathname = normalise(usePathname() ?? "/");
	const page = pageFor(pathname);
	const { previous, next } = siblings(pathname);
	const group = NAV.find((entry) => entry.pages.some((item) => item.href === pathname));

	return (
		<>
			<div className="page-meta">
				<span>
					{page === undefined ? (
						"quarry documentation"
					) : (
						<>
							{group?.title ?? "Docs"} · {page.title}
						</>
					)}
				</span>
				{page === undefined ? null : (
					<a href={editUrl(page.file)} target="_blank" rel="noreferrer">
						Edit this page on GitHub
					</a>
				)}
			</div>
			{previous === undefined && next === undefined ? null : (
				<nav className="pager" aria-label="Pagination">
					{previous === undefined ? null : (
						<Link className="pager-link" href={previous.href}>
							<span className="label">Previous</span>
							<strong>{previous.title}</strong>
						</Link>
					)}
					{next === undefined ? null : (
						<Link className="pager-link pager-next" href={next.href}>
							<span className="label">Next</span>
							<strong>{next.title}</strong>
						</Link>
					)}
				</nav>
			)}
			<p className="page-meta" style={{ border: 0, marginTop: 8 }}>
				<span>
					{SITE.name} {SITE.version} · MIT
				</span>
				<a href={SITE.repo} target="_blank" rel="noreferrer">
					Source
				</a>
			</p>
		</>
	);
}
