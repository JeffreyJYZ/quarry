import DisasmPane from "@/ui/debug/memory/DisasmPane";
import MemoryPane from "@/ui/debug/memory/MemoryPane";
import "@/ui/debug/memory/memory-view.css";

/**
 * The memory and disassembly panes. Both render with or without a session: the address fields stay
 * editable and each pane says "no session" instead of holding rows from a session that ended.
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
		<>
			<section className="debug-section debug-pane-section">
				<div className="debug-section-head">
					<span className="label">memory</span>
					<span className="debug-mem">bytes at the selected frame or variable</span>
				</div>
				<div className="debug-pane">
					<MemoryPane session={session} address={memoryAddress} />
				</div>
			</section>
			<section className="debug-section debug-pane-section">
				<div className="debug-section-head">
					<span className="label">disassembly</span>
					<span className="debug-mem">instructions at the instruction pointer</span>
				</div>
				<div className="debug-pane">
					<DisasmPane session={session} address={disasmAddress} />
				</div>
			</section>
		</>
	);
}
