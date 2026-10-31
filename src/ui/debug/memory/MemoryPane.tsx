import { useCallback, useEffect, useState } from "react";
import { formatAddress, parseAddress } from "@/lib/debug/memory/hex";
import type { MemoryCellApi } from "@/ui/debug/memory/MemoryCell";
import MemoryBody from "@/ui/debug/memory/MemoryBody";
import MemoryToolbar from "@/ui/debug/memory/MemoryToolbar";
import {
	DEFAULT_PAGE,
	type Loaded,
	type Request,
	requestFor,
	storedPageSize,
	storedRowWidth,
	storePageSize,
	storeRowWidth,
} from "@/ui/debug/memory/parts";
import { resolveAddress } from "@/lib/debug/memory/resolve";
import { useMemoryClipboard } from "@/ui/debug/memory/useMemoryClipboard";
import { useMemoryEdit } from "@/ui/debug/memory/useMemoryEdit";
import { useMemoryHistory } from "@/ui/debug/memory/useMemoryHistory";
import { useMemoryRead } from "@/ui/debug/memory/useMemoryRead";
import { useMemoryRows } from "@/ui/debug/memory/useMemoryRows";
import "@/ui/debug/memory/memory.css";

export type MemoryPaneProps = {
	session: string | null;
	/** Frame or variable address, with or without `0x`; `null` means nothing is selected. */
	address: string | null;
	/** The stopped frame an expression is evaluated in, so `&x` resolves against the right locals. */
	frameId: number | null;
};

/**
 * Hex viewer over `readMemory`. Pages are read in 256-byte chunks because the adapter may refuse a
 * read that crosses an unmapped boundary, so a failed chunk becomes an `unmapped` band instead of
 * losing the whole page. Without a session the bar stays editable and the table is replaced by a
 * "no session" line, so nothing from an ended session lingers on screen.
 */
export default function MemoryPane({ session, address, frameId }: MemoryPaneProps) {
	const [request, setRequest] = useState<Request | null>(() => {
		const base = requestFor(address);
		if (base === null) return null;
		return { ...base, size: storedPageSize() };
	});
	const [input, setInput] = useState(() => formatAddress(parseAddress(address)));
	const [followed, setFollowed] = useState(true);
	const [rowWidth, setRowWidth] = useState(() => storedRowWidth());
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [selected, setSelected] = useState<bigint | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [resolving, setResolving] = useState(false);
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
			size: previous?.size ?? storedPageSize(),
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
			return { start: next, size: previous?.size ?? storedPageSize(), serial: 0 };
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

	/** Go to what the field says: hex, a variable, or an expression such as `&count`. */
	const commit = async () => {
		setResolving(true);
		setError(null);
		try {
			const resolved = await resolveAddress(input, { session, frameId });
			if (resolved.address === null) {
				setError(resolved.error);
				return;
			}
			const next = resolved.address;
			setInput(formatAddress(next));
			setSelected(null);
			recordVisit(next);
			setRequest({ start: next, size: pageSize, serial: (request?.serial ?? 0) + 1 });
		} finally {
			setResolving(false);
		}
	};

	const changeSize = (size: number) => {
		storePageSize(size);
		setRequest((previous) =>
			previous === null ? null : { ...previous, size, serial: previous.serial + 1 },
		);
	};

	const edit = useMemoryEdit({ session: liveSession, loaded, setError, setSelected, refresh });
	const editRangeStart = edit.rangeStart;
	const editRangeFinish = edit.rangeFinish;
	const clipboard = useMemoryClipboard({
		loaded,
		setError,
		rangeStart: editRangeStart,
		rangeFinish: editRangeFinish,
	});

	const { rows, interpreted, selectedLabel } = useMemoryRows({
		loaded,
		rowWidth,
		selected,
		rangeStart: editRangeStart,
		rangeFinish: editRangeFinish,
	});

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
				onRowWidthChange={(value) => {
					storeRowWidth(value);
					setRowWidth(value);
				}}
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
				busy={busy || resolving}
			/>
			<MemoryBody
				session={session}
				hasRequest={request !== null}
				loaded={loaded}
				busy={busy}
				error={error}
				copied={clipboard.copied}
				rows={rows}
				api={api}
				rowWidth={rowWidth}
				selectedLabel={selectedLabel}
				interpreted={interpreted}
				onCopyAddress={(target) => void clipboard.copyAddress(target)}
			/>
		</div>
	);
}
