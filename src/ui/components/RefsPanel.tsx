import type { Location } from "@/lib/project/api";

export type RefsPanelProps = {
	locations: Location[];
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
};

function splitPath(path: string): { dir: string; name: string } {
	const last = path.lastIndexOf("/");
	if (last === -1) return { dir: "", name: path };
	return { dir: path.slice(0, last), name: path.slice(last + 1) };
}

export default function RefsPanel({ locations, onNavigate, onClose }: RefsPanelProps) {
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
				{locations.length === 0 ? (
					<p className="refs-empty">No references</p>
				) : (
					locations.map((location) => {
						const { dir, name } = splitPath(location.path);
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
								<span className="refs-dir">{dir === "" ? "" : `${dir}/`}</span>
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
