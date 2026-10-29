import type { ReactNode } from "react";

/** An aside with fixed tones, so prose never hand-writes a box. */
export function Callout({
	tone = "note",
	title,
	children,
}: {
	tone?: "note" | "tip" | "warn" | "danger";
	title?: string;
	children: ReactNode;
}) {
	return (
		<aside className="callout" data-tone={tone}>
			{title === undefined ? null : <p className="callout-head">{title}</p>}
			{children}
		</aside>
	);
}

/** A key cap, so shortcuts read as keys rather than as inline code. */
export function Kbd({ children }: { children: ReactNode }) {
	return <kbd>{children}</kbd>;
}

export const mdxComponents = { Callout, Kbd };
