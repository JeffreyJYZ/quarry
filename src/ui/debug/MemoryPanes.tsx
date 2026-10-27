import DisasmPane from "@/ui/debug/memory/DisasmPane";
import MemoryPane from "@/ui/debug/memory/MemoryPane";
import "@/ui/debug/memory/memory-view.css";

/**
 * The memory tab: the hex dump with the disassembly under it.
 *
 * Each pane carries its own single toolbar — address, width, the actions — with the pane's name as
 * the first item on that row. No second header line, because the tab is already called Memory and
 * two labels for one pane is what made this window look crowded.
 */
export default function MemoryPanes({
	session,
	memoryAddress,
	disasmAddress,
}: {
	session: string | null;
	memoryAddress: string | null;
	disasmAddress: string | null;
}) {
	return (
		<div className="memory-panes">
			<MemoryPane session={session} address={memoryAddress} />
			<DisasmPane session={session} address={disasmAddress} />
		</div>
	);
}
