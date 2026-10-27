import { parseAddress } from "@/lib/debug/memory/hex";
import type { DisassembledInstruction } from "@/lib/project/api";

/** The disassembly rows, with the instruction at the requested address marked as current. */
export default function DisasmList({
	rows,
	active,
}: {
	rows: DisassembledInstruction[];
	active: bigint | null;
}) {
	return (
		<ol className="disasm-list">
			{rows.map((row) => {
				const current = active !== null && parseAddress(row.address) === active;
				return (
					<li className={current ? "disasm-row active" : "disasm-row"} key={row.address}>
						<span className="disasm-addr">{row.address}</span>
						<span className="disasm-code">{row.instruction}</span>
						{row.symbol !== null && <span className="disasm-symbol">{row.symbol}</span>}
					</li>
				);
			})}
		</ol>
	);
}
