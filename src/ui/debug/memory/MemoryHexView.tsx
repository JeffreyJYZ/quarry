import { asciiByte, formatRowAddress } from "@/lib/debug/memory/hex";
import MemoryCell from "@/ui/debug/memory/MemoryCell";
import type { MemoryCellApi } from "@/ui/debug/memory/MemoryCell";
import type { MemoryRow } from "@/lib/debug/memory/hex";

/** The hex table rows: address column, byte cells and the ASCII column. */
export default function MemoryHexView({
	rows,
	api,
	onCopyAddress,
}: {
	rows: MemoryRow[];
	api: MemoryCellApi;
	onCopyAddress: (target: bigint) => void;
}) {
	return (
		<div className="memory-scroll">
			<div className="memory-table">
				{rows.map((row) => {
					const unreadable = row.bytes.every((byte) => byte === null);
					return (
						<div
							className={unreadable ? "memory-row unreadable" : "memory-row"}
							key={row.address.toString(16)}
						>
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
									<span className="memory-cells">
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
										{row.bytes.map((byte) => asciiByte(byte))}
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
