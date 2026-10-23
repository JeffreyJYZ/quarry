import { hexValue } from "@/lib/debug/memory/hex";
import type { Interpreted } from "@/lib/debug/memory/hex";

/** The interpreted-value footer shown for the selected byte. */
export default function MemoryValueView({
	selectedLabel,
	interpreted,
}: {
	selectedLabel: string;
	interpreted: Interpreted[] | null;
}) {
	return (
		<div className="memory-view">
			{interpreted === null ? (
				<span className="memory-muted">Select a byte for its value</span>
			) : (
				<>
					<span className="memory-view-address">{selectedLabel}</span>
					{interpreted.map((item) => (
						<span className="memory-view-item" key={item.width}>
							<span className="memory-muted">u{item.width * 8}</span>{" "}
							<span className="memory-value">{hexValue(item.value, item.width)}</span>
							{item.partial && <span className="memory-partial">partial</span>}
						</span>
					))}
				</>
			)}
		</div>
	);
}
