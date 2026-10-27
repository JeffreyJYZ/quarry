import MemoryPane from "@/ui/debug/memory/MemoryPane";
import "@/ui/debug/memory/memory-view.css";

/**
 * The memory tab: the hex dump, and nothing else.
 *
 * CLion's Memory View is one toolbar and one table; stacking a disassembly section under it gave
 * the window two toolbars and two titles for one tab. The disassembly is an editor split.
 */
export default function MemoryPanes({
	session,
	memoryAddress,
	frameId,
}: {
	session: string | null;
	memoryAddress: string | null;
	/** The stopped frame, so an expression typed into the address field resolves there. */
	frameId: number | null;
}) {
	return (
		<div className="memory-panes">
			<MemoryPane session={session} address={memoryAddress} frameId={frameId} />
		</div>
	);
}
