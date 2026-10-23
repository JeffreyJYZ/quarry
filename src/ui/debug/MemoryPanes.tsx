import DisasmPane from "@/ui/debug/memory/DisasmPane";
import MemoryPane from "@/ui/debug/memory/MemoryPane";

/** The memory and disassembly panes, rendered only while a session is live. */
export default function MemoryPanes({
	session,
	memoryAddress,
	disasmAddress,
}: {
	session: string | null;
	memoryAddress: string | null;
	disasmAddress: string | null;
}) {
	if (session === null) {
		return null;
	}

	return (
		<>
			<section className="debug-section debug-pane-section">
				<div className="debug-section-head">
					<span className="label">memory</span>
					<span className="debug-mem">{memoryAddress ?? "no address"}</span>
				</div>
				<div className="debug-pane">
					<MemoryPane session={session} address={memoryAddress} />
				</div>
			</section>
			<section className="debug-section debug-pane-section">
				<div className="debug-section-head">
					<span className="label">disassembly</span>
					<span className="debug-mem">{disasmAddress ?? "no address"}</span>
				</div>
				<div className="debug-pane">
					<DisasmPane session={session} address={disasmAddress} />
				</div>
			</section>
		</>
	);
}
