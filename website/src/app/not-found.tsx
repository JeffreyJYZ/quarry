import Link from "next/link";

/** A 404 that still offers a way out: the docs index and the most-used pages. */
export default function NotFound() {
	return (
		<main id="content" className="hero">
			<p className="label">Error 404</p>
			<h1 style={{ margin: "10px 0 8px", fontSize: 40, letterSpacing: "-0.03em" }}>
				No page at that address
			</h1>
			<p className="hero-lede">
				The link may be from an older revision of the docs. These are the pages people
				usually want.
			</p>
			<div className="hero-actions">
				<Link className="button button-primary" href="/docs">
					Documentation
				</Link>
				<Link className="button" href="/docs/shortcuts">
					Keyboard shortcuts
				</Link>
				<Link className="button" href="/docs/install">
					Install
				</Link>
			</div>
		</main>
	);
}
