import {
	clipLine,
	isPreviewStale,
	PREVIEW_LIMIT,
	type PreviewLine,
	type PreviewSnapshot,
} from "@/lib/search/model";

export function SearchReplace({
	showReplace,
	replacement,
	onReplacementChange,
	onPreview,
	onReplaceAll,
	preview,
	trimmed,
	summary,
}: {
	showReplace: boolean;
	replacement: string;
	onReplacementChange: (value: string) => void;
	onPreview: () => void;
	onReplaceAll: () => void;
	preview: PreviewSnapshot | null;
	trimmed: string;
	summary: string | null;
}) {
	return (
		<>
			{showReplace ? (
				<div className="search-replace-row">
					<input
						className="search-input"
						value={replacement}
						placeholder="replacement"
						aria-label="Replacement"
						spellCheck={false}
						autoComplete="off"
						onChange={(event) => onReplacementChange(event.target.value)}
					/>
					<button type="button" className="search-toggle" onClick={onPreview}>
						preview
					</button>
					<button type="button" className="search-toggle" onClick={onReplaceAll}>
						replace all
					</button>
				</div>
			) : null}
			{preview !== null ? (
				<div className="search-preview">
					{preview.lines.map((p: PreviewLine) => (
						<div
							className="search-preview-line"
							key={`${p.path}:${p.line}:${p.oldText}`}
						>
							<span className="search-pos">
								{p.path}:{p.line}
							</span>
							<span className="search-text">{clipLine(p.oldText)}</span>
							<span className="search-text">→ {clipLine(p.newText)}</span>
						</div>
					))}
					{preview.truncated ? (
						<p className="search-state">preview truncated (cap {PREVIEW_LIMIT})</p>
					) : null}
					{isPreviewStale(preview, trimmed, replacement) ? (
						<p className="search-state error">preview is stale</p>
					) : null}
				</div>
			) : null}
			{summary !== null ? <p className="search-state">{summary}</p> : null}
		</>
	);
}
