import { type FileBuffer, isDirty } from "@/project/buffer";

export type TabStripProps = {
	buffers: FileBuffer[];
	activePath: string | null;
	onActivate: (path: string) => void;
	onClose: (path: string) => void;
};

export default function TabStrip({ buffers, activePath, onActivate, onClose }: TabStripProps) {
	return (
		<div className="tabstrip">
			{buffers.map((buffer) => {
				const active = buffer.path === activePath;
				return (
					<div key={buffer.path} className={active ? "tab active" : "tab"}>
						<button
							type="button"
							className="tab-name"
							title={buffer.path}
							onClick={() => onActivate(buffer.path)}
						>
							{isDirty(buffer) ? (
								<span className="dirty" title="unsaved changes">
									•
								</span>
							) : null}
							{buffer.name}
						</button>
						<button
							type="button"
							className="tab-close"
							aria-label={`Close ${buffer.name}`}
							onClick={() => onClose(buffer.path)}
						>
							×
						</button>
					</div>
				);
			})}
		</div>
	);
}
