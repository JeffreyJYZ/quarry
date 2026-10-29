import Breadcrumbs from "~/components/Breadcrumbs";
import CodeCopy from "~/components/CodeCopy";
import DocFooter from "~/components/DocFooter";
import NavScrim from "~/components/NavScrim";
import Sidebar from "~/components/Sidebar";
import Toc from "~/components/Toc";

/** The docs frame: navigation, the article, and its headings. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="docs-shell">
			<NavScrim />
			<Sidebar />
			<main className="docs-main" id="content">
				<div className="doc">
					<Breadcrumbs />
					<article className="prose">{children}</article>
					<DocFooter />
				</div>
			</main>
			<Toc />
			<CodeCopy />
		</div>
	);
}
