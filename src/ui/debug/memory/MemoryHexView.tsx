import {
	asciiColumn,
	formatOffset,
	formatRowAddress,
	type MemoryRow,
} from "@/lib/debug/memory/hex";
import MemoryCell from "@/ui/debug/memory/MemoryCell";
import type { MemoryCellApi } from "@/ui/debug/memory/MemoryCell";

/** The hex table: offset and address columns, byte cells, then the ASCII column. */
export default function MemoryHexView({
	rows,
	api,
	rowWidth,
	onCopyAddress,
}: {
	rows: MemoryRow[];
	api: MemoryCellApi;
	rowWidth: number;
	onCopyAddress: (target: bigint) => void;
}) {
	return (
		<div className="memory-scroll">
			<div className="memory-table">
				<div className="memory-row memory-row-head" aria-hidden="true">
					<span className="memory-offset">offset</span>
					<span className="memory-addr">address</span>
					<span className="memory-cells-head">hex</span>
					<span className="memory-ascii">ascii</span>
				</div>
				{rows.map((row) => {
					const unreadable = row.bytes.every((byte) => byte === null);
					return (
						<div
							className={unreadable ? "memory-row unreadable" : "memory-row"}
							key={row.address.toString(16)}
						>
							<span className="memory-offset">{formatOffset(row.offset)}</span>
							<button
								type="button"
								className="memory-addr"
								onClick={() => void onCopyAddress(row.address)}
							>
								{formatRowAddress(row.address, row.digits)}
							</button>
							{unreadable ? (
								<span className="memory-band">unmapped</span>
							) : (
								<>
									<span
										className="memory-cells"
										style={{
											gridTemplateColumns: `repeat(${rowWidth}, 2ch)`,
										}}
									>
										{row.bytes.map((byte, index) => {
											const cell = row.address + BigInt(index);
											return (
												<MemoryCell
													key={cell.toString(16)}
													cell={cell}
													byte={byte}
													api={api}
												/>
											);
										})}
									</span>
									<span className="memory-ascii">
										{asciiColumn(row.bytes, rowWidth)}
									</span>
								</>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
