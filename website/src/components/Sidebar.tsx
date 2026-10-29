"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

/** Strip the trailing slash the static export adds, so a route compares equal to its nav entry. */
export function normalise(path: string): string {
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** The grouped documentation tree, with the current page marked the way the app marks a tool. */
export default function Sidebar() {
	const pathname = normalise(usePathname() ?? "/");
	return (
		<nav className="sidebar" aria-label="Documentation">
			{NAV.map((group) => (
				<div className="sidebar-group" key={group.title}>
					<p className="label">{group.title}</p>
					<ul className="sidebar-list">
						{group.pages.map((page) => (
							<li key={page.href}>
								<Link
									href={page.href}
									className="sidebar-link"
									aria-current={pathname === page.href ? "page" : undefined}
									onClick={() => {
										document.documentElement.dataset.nav = "";
									}}
								>
									{page.title}
								</Link>
							</li>
						))}
					</ul>
				</div>
			))}
		</nav>
	);
}
