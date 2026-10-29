"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalise } from "@/components/Sidebar";
import { NAV, pageFor } from "@/lib/nav";

/** Docs / group / page, so a deep page always says where it sits. */
export default function Breadcrumbs() {
	const pathname = normalise(usePathname() ?? "/");
	const page = pageFor(pathname);
	const group = NAV.find((entry) => entry.pages.some((item) => item.href === pathname));

	return (
		<nav className="breadcrumbs" aria-label="Breadcrumb">
			<Link href="/docs">Docs</Link>
			{group === undefined ? null : (
				<>
					<span className="sep">/</span>
					<span>{group.title}</span>
				</>
			)}
			{page === undefined ? null : (
				<>
					<span className="sep">/</span>
					<span>{page.title}</span>
				</>
			)}
		</nav>
	);
}
