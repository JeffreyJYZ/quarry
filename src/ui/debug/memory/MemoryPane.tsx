import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildRows,
	formatAddress,
	type Interpreted,
	interpretAt,
	parseAddress,
	ROW_BYTES,
} from "@/lib/debug/memory/hex";
import type { MemoryCellApi } from "@/ui/debug/memory/MemoryCell";
import MemoryHexView from "@/ui/debug/memory/MemoryHexView";
import MemoryToolbar from "@/ui/debug/memory/MemoryToolbar";
import MemoryValueView from "@/ui/debug/memory/MemoryValueView";
import { DEFAULT_PAGE, type Loaded, type Request, requestFor } from "@/ui/debug/memory/parts";
import { useMemoryClipboard } from "@/ui/debug/memory/useMemoryClipboard";
import { useMemoryEdit } from "@/ui/debug/memory/useMemoryEdit";
import { useMemoryHistory } from "@/ui/debug/memory/useMemoryHistory";
import { useMemoryRead } from "@/ui/debug/memory/useMemoryRead";
import "@/ui/debug/memory/memory.css";

export type MemoryPaneProps = {
	session: string | null;
	/** Frame or variable address, with or without `0x`; `null` means nothing is selected. */
	address: string | null;
};

/**
 * Hex viewer over `readMemory`. Pages are read in 256-byte chunks because the adapter may refuse a
 * read that crosses an unmapped boundary, so a failed chunk becomes an `unmapped` band instead of
 * losing the whole page. Without a session the bar stays editable and the table is replaced by a
 * "no session" line, so nothing from an ended session lingers on screen.
 */
export default function MemoryPane({ session, address }: MemoryPaneProps) {
	const [request, setRequest] = useState<Request | null>(() => requestFor(address));
	const [input, setInput] = useState(() => formatAddress(parseAddress(address)));
	const [followed, setFollowed] = useState(true);
	const [rowWidth, setRowWidth] = useState(ROW_BYTES);
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [selected, setSelected] = useState<bigint | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	/** Bumped per read so an older reply can never overwrite a newer one. */
	const pageSize = request?.size ?? DEFAULT_PAGE;
	/** The hooks take a session id, so a pane with no session hands them an inert empty one. */
	const liveSession = session ?? "";

	const navigate = useCallback((next: bigint) => {
		setInput(formatAddress(next));
		setSelected(null);
		setError(null);
		setRequest((previous) => ({
			start: next,
			size: previous?.size ?? DEFAULT_PAGE,
			serial: (previous?.serial ?? 0) + 1,
		}));
	}, []);

	const history = useMemoryHistory(navigate);
	const { recordVisit } = history;

	const refresh = useCallback(() => {
		setRequest((previous) =>
			previous === null ? null : { ...previous, serial: previous.serial + 1 },
		);
	}, []);

	// Follow the selected frame while the toggle is on; typing switches it off so a pinned address
	// survives the next stop.
	useEffect(() => {
		if (!followed) {
			return;
		}
		const next = parseAddress(address);
		setInput(next === null ? "" : formatAddress(next));
		setSelected(null);
		setRequest((previous) => {
			if (next === null) {
				return null;
			}
			if (previous !== null && previous.start === next) {
				return previous;
			}
			recordVisit(next);
			return { start: next, size: previous?.size ?? DEFAULT_PAGE, serial: 0 };
		});
	}, [address, followed, recordVisit]);

	useMemoryRead({
		session: liveSession,
		request: session === null ? null : request,
		setLoaded,
		setError,
		setSelected,
		setBusy,
	});

	const commit = () => {
		const next = parseAddress(input);
		if (next === null) {
			setError(
				input.trim() === "" ? "Enter a hexadecimal address" : "Not a hexadecimal address",
			);
			return;
		}
		setError(null);
		setSelected(null);
		recordVisit(next);
		setRequest({ start: next, size: pageSize, serial: (request?.serial ?? 0) + 1 });
	};

	const changeSize = (size: number) => {
		setRequest((previous) =>
			previous === null ? null : { ...previous, size, serial: previous.serial + 1 },
		);
	};

	const rows = useMemo(
		() => (loaded === null ? [] : buildRows(loaded.base, loaded.bytes, rowWidth)),
		[loaded, rowWidth],
	);

	const interpreted = useMemo<Interpreted[] | null>(() => {
		if (loaded === null || selected === null) {
			return null;
		}
		const values = interpretAt(loaded.bytes, Number(selected - loaded.base));
		return values.length === 0 ? null : values;
	}, [loaded, selected]);

	const selectedLabel = selected === null ? "" : formatAddress(selected);

	const edit = useMemoryEdit({ session: liveSession, loaded, setError, setSelected, refresh });
	const clipboard = useMemoryClipboard({ loaded, setError });

	const api: MemoryCellApi = { ...edit, selected };

	return (
		<div className="memory-pane">
			<MemoryToolbar
				input={input}
				onInputChange={(value) => {
					setInput(value);
					setFollowed(false);
				}}
				onCommit={commit}
				rowWidth={rowWidth}
				onRowWidthChange={setRowWidth}
				pageSize={pageSize}
				onSizeChange={changeSize}
				onCopy={() => void clipboard.copyHex()}
				canGoBack={history.historyIndex > 0}
				onBack={history.goBack}
				canGoForward={history.historyIndex < history.history.length - 1}
				onForward={history.goForward}
				followed={followed}
				onToggleFollow={() => setFollowed((value) => !value)}
				address={address}
				editMode={edit.editMode}
				onToggleEdit={() => edit.setEditMode((value) => !value)}
				rangeLabel={edit.rangeLabel}
				rangeInput={edit.rangeInput}
				busy={busy}
			/>
			{error !== null && (
				<p className="memory-error" role="alert">
					{error}
				</p>
			)}
			{clipboard.copied !== null && (
				<p className="memory-muted">{`Copied ${clipboard.copied}`}</p>
			)}
			{session === null ? (
				<p className="memory-empty">No session: launch or attach to read memory</p>
			) : request === null ? (
				<p className="memory-empty">Enter an address to read memory</p>
			) : loaded === null ? (
				<p className="memory-empty">{busy ? "Reading memory…" : "No bytes loaded"}</p>
			) : (
				<MemoryHexView
					rows={rows}
					api={api}
					rowWidth={rowWidth}
					pageStart={loaded.base}
					onCopyAddress={(target) => void clipboard.copyAddress(target)}
				/>
			)}
			<MemoryValueView selectedLabel={selectedLabel} interpreted={interpreted} />
		</div>
	);
}
