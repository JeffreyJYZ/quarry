import { asciiColumn, formatRowAddress, type MemoryRow } from "@/lib/debug/memory/hex";
import MemoryCell from "@/ui/debug/memory/MemoryCell";
import type { MemoryCellApi } from "@/ui/debug/memory/MemoryCell";

/** The hex table: offset and address columns, byte cells, then the ASCII column. */
export default function MemoryHexView({
	rows,
	api,
	rowWidth,
	pageStart,
	onCopyAddress,
}: {
	rows: MemoryRow[];
	api: MemoryCellApi;
	rowWidth: number;
	/** The address the page starts at: its row is the one the user is looking at. */
	pageStart: bigint;
	onCopyAddress: (target: bigint) => void;
}) {
	return (
		<div className="memory-scroll">
			<div className="memory-table">
				<div className="memory-row memory-row-head" aria-hidden="true">
					<span className="memory-addr">address</span>
					<span className="memory-cells-head">hex</span>
					<span className="memory-ascii">ascii</span>
				</div>
				{rows.map((row) => {
					const unreadable = row.bytes.every((byte) => byte === null);
					const current = row.address === pageStart;
					const rowClass = ["memory-row"];
					if (unreadable) rowClass.push("unreadable");
					if (current) rowClass.push("current");
					return (
						<div className={rowClass.join(" ")} key={row.address.toString(16)}>
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
										{/* Two groups of eight, the way a hex dump is read. */}
										{[0, 1].map((group) => (
											<span className="memory-group" key={group}>
												{row.bytes
													.slice(group * 8, group * 8 + 8)
													.map((byte, index) => {
														const cell =
															row.address + BigInt(group * 8 + index);
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
										))}
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
