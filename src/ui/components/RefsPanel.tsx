import type { Location } from "@/lib/project/api";
import { directoryOf, fileName, separatorOf } from "@/lib/project/paths";

export type RefsPanelProps = {
	locations: Location[];
	loading?: boolean;
	error?: string | null;
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
};

export default function RefsPanel({
	locations,
	loading = false,
	error = null,
	onNavigate,
	onClose,
}: RefsPanelProps) {
	return (
		<section className="refs-panel" aria-label="References">
			<div className="refs-head">
				<span className="refs-title">Refs</span>
				<span className="refs-count">{locations.length}</span>
				<button type="button" className="refs-close" onClick={onClose}>
					close
				</button>
			</div>
			<div className="refs-body">
				{loading ? (
					<p className="refs-empty">Loading references…</p>
				) : error !== null ? (
					<p className="refs-empty error">{error}</p>
				) : locations.length === 0 ? (
					<p className="refs-empty">No references</p>
				) : (
					locations.map((location) => {
						const dir = directoryOf(location.path);
						const name = fileName(location.path);
						const line = location.range.start.line + 1;
						const column = location.range.start.character + 1;
						return (
							<button
								key={`${location.path}:${line}:${column}`}
								type="button"
								className="refs-row"
								onClick={() =>
									onNavigate(
										location.path,
										location.range.start.line,
										location.range.start.character,
									)
								}
							>
								<span className="refs-file">{name}</span>
								<span className="refs-dir">
									{dir === "" ? "" : `${dir}${separatorOf(dir)}`}
								</span>
								<span className="refs-pos">
									{line}:{column}
								</span>
							</button>
						);
					})
				)}
			</div>
		</section>
	);
}
