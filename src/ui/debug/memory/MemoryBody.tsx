import type { Interpreted } from "@/lib/debug/memory/hex";
import type { MemoryCellApi } from "@/ui/debug/memory/MemoryCell";
import MemoryHexView from "@/ui/debug/memory/MemoryHexView";
import MemoryValueView from "@/ui/debug/memory/MemoryValueView";
import type { Loaded } from "@/ui/debug/memory/parts";
import type { MemoryRow } from "@/lib/debug/memory/hex";

/**
 * Everything under the memory toolbar: the notices, then either a reason the table is empty or the
 * table, then the strip that explains the selected byte.
 *
 * One place, because the empty states and the table are the same slot — the pane above decides which
 * case applies, and this draws it.
 */
export default function MemoryBody({
	session,
	hasRequest,
	loaded,
	busy,
	error,
	copied,
	rows,
	api,
	rowWidth,
	selectedLabel,
	interpreted,
	onCopyAddress,
}: {
	session: string | null;
	hasRequest: boolean;
	loaded: Loaded | null;
	busy: boolean;
	error: string | null;
	copied: string | null;
	rows: MemoryRow[];
	api: MemoryCellApi;
	rowWidth: number;
	selectedLabel: string;
	interpreted: Interpreted[] | null;
	onCopyAddress: (target: bigint) => void;
}) {
	return (
		<>
			{error !== null ? (
				<p className="memory-error" role="alert">
					{error}
				</p>
			) : null}
			{copied !== null ? <p className="memory-muted">{`Copied ${copied}`}</p> : null}
			{session === null ? (
				<p className="memory-empty">No session: launch or attach to read memory</p>
			) : !hasRequest ? (
				<p className="memory-empty">Enter an address to read memory</p>
			) : loaded === null ? (
				<p className="memory-empty">{busy ? "Reading memory…" : "No bytes loaded"}</p>
			) : (
				<MemoryHexView
					rows={rows}
					api={api}
					rowWidth={rowWidth}
					pageStart={loaded.base}
					onCopyAddress={onCopyAddress}
				/>
			)}
			<MemoryValueView selectedLabel={selectedLabel} interpreted={interpreted} />
		</>
	);
}
