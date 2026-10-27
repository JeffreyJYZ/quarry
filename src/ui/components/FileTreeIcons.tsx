/** Inline glyphs: the tree action buttons used to rely on emoji, which render as boxes in WKWebView. */
export function FolderIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
			<path
				d="M1 2.5h3l1 1h4v5H1z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function indent(depth: number): { paddingLeft: string } {
	return { paddingLeft: `${8 + depth * 12}px` };
}
