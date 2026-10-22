import { useEffect, useMemo, useRef, useState } from "react";
import { dapReadMemory } from "@/project/api";
import { describeError } from "@/project/errors";
import {
	asciiByte,
	buildRows,
	CHUNK_BYTES,
	formatAddress,
	formatRowAddress,
	hexByte,
	hexValue,
	type Interpreted,
	interpretAt,
	mergeChunk,
	parseAddress,
} from "./hex";
import "./memory.css";

const PAGE_SIZES = [64, 256, 1024];
const DEFAULT_PAGE = 256;

export type MemoryPaneProps = {
	session: string;
	/** Frame or variable address, with or without `0x`; `null` means nothing is selected. */
	address: string | null;
};

type Request = {
	start: bigint;
	size: number;
	/** Bumped per read so a repeat read of the same address is a real dependency change. */
	serial: number;
};

type Loaded = {
	base: bigint;
	size: number;
	/** One slot per requested byte; `null` marks a byte inside an unreadable chunk. */
	bytes: Array<number | null>;
};

function requestFor(address: string | null): Request | null {
	const start = parseAddress(address);
	return start === null ? null : { start, size: DEFAULT_PAGE, serial: 0 };
}

/**
 * Hex viewer over `readMemory`. Pages are read in 256-byte chunks because the adapter may refuse a
 * read that crosses an unmapped boundary, so a failed chunk becomes an `unmapped` band instead of
 * losing the whole page.
 */
export default function MemoryPane({ session, address }: MemoryPaneProps) {
	const [request, setRequest] = useState<Request | null>(() => requestFor(address));
	const [input, setInput] = useState(() => formatAddress(parseAddress(address)));
	const [followed, setFollowed] = useState(true);
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [selected, setSelected] = useState<bigint | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	/** Bumped per read so an older reply can never overwrite a newer one. */
	const sequence = useRef(0);

	const pageSize = request?.size ?? DEFAULT_PAGE;

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
			return { start: next, size: previous?.size ?? DEFAULT_PAGE, serial: 0 };
		});
	}, [address, followed]);

	useEffect(() => {
		if (request === null) {
			sequence.current += 1;
			setLoaded(null);
			setError(null);
			setSelected(null);
			setBusy(false);
			return;
		}
		const { start, size } = request;
		sequence.current += 1;
		const ticket = sequence.current;
		let live = true;
		setBusy(true);
		const read = async () => {
			const bytes: Array<number | null> = new Array(size).fill(null);
			const failures: string[] = [];
			let chunks = 0;
			for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
				const length = Math.min(CHUNK_BYTES, size - offset);
				const chunk = start + BigInt(offset);
				chunks += 1;
				try {
					const dump = await dapReadMemory(session, formatAddress(chunk), length);
					if (!live || ticket !== sequence.current) {
						return;
					}
					const origin = parseAddress(dump.address) ?? chunk;
					const placed = mergeChunk(bytes, start, origin, dump.bytes);
					if (dump.bytes.length < length || placed < dump.bytes.length) {
						failures.push(`short read at ${formatAddress(chunk)}`);
					}
				} catch (failure) {
					if (!live || ticket !== sequence.current) {
						return;
					}
					failures.push(describeError(failure));
				}
			}
			if (!live || ticket !== sequence.current) {
				return;
			}
			setLoaded({ base: start, size, bytes });
			// Partial failures stay visible as bands; only a page with nothing readable gets a line.
			setError(failures.length === chunks ? (failures[0] ?? "Memory read failed") : null);
			setBusy(false);
		};
		void read();
		return () => {
			live = false;
		};
	}, [session, request]);

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
		setRequest({ start: next, size: pageSize, serial: (request?.serial ?? 0) + 1 });
	};

	const changeSize = (size: number) => {
		setRequest((previous) =>
			previous === null ? null : { ...previous, size, serial: previous.serial + 1 },
		);
	};

	const rows = useMemo(
		() => (loaded === null ? [] : buildRows(loaded.base, loaded.bytes)),
		[loaded],
	);

	const interpreted = useMemo<Interpreted[] | null>(() => {
		if (loaded === null || selected === null) {
			return null;
		}
		const values = interpretAt(loaded.bytes, Number(selected - loaded.base));
		return values.length === 0 ? null : values;
	}, [loaded, selected]);

	const selectedLabel = selected === null ? "" : formatAddress(selected);

	return (
		<div className="memory-pane">
			<div className="memory-head">
				<label className="memory-field">
					<span className="memory-label">Address</span>
					<input
						className="memory-input"
						value={input}
						spellCheck={false}
						autoComplete="off"
						placeholder="0x…"
						aria-label="Start address"
						onChange={(event) => {
							setInput(event.target.value);
							setFollowed(false);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commit();
							}
						}}
					/>
				</label>
				<label className="memory-field memory-field-narrow">
					<span className="memory-label">Bytes</span>
					<select
						className="memory-select"
						value={String(pageSize)}
						aria-label="Page size"
						onChange={(event) => changeSize(Number(event.target.value))}
					>
						{PAGE_SIZES.map((size) => (
							<option key={size} value={String(size)}>
								{size}
							</option>
						))}
					</select>
				</label>
				<button type="button" className="button" onClick={commit}>
					Refresh
				</button>
				<button
					type="button"
					className={followed ? "button active" : "button"}
					aria-pressed={followed}
					disabled={address === null}
					onClick={() => setFollowed((value) => !value)}
				>
					Follow pointer
				</button>
				{busy && <span className="memory-muted memory-head-note">reading</span>}
			</div>
			{error !== null && <p className="memory-error">{error}</p>}
			{request === null ? (
				<p className="memory-empty">No memory address selected</p>
			) : loaded === null ? (
				<p className="memory-empty">{busy ? "Reading memory…" : "No bytes loaded"}</p>
			) : (
				<div className="memory-scroll">
					<div className="memory-table">
						{rows.map((row) => {
							const unreadable = row.bytes.every((byte) => byte === null);
							return (
								<div
									className={unreadable ? "memory-row unreadable" : "memory-row"}
									key={row.address.toString(16)}
								>
									<span className="memory-addr">
										{formatRowAddress(row.address, row.digits)}
									</span>
									{unreadable ? (
										<span className="memory-band">unmapped</span>
									) : (
										<>
											<span className="memory-cells">
												{row.bytes.map((byte, index) => {
													const cell = row.address + BigInt(index);
													const current = selected === cell;
													return (
														<button
															type="button"
															className={
																current
																	? "memory-cell selected"
																	: "memory-cell"
															}
															key={cell.toString(16)}
															aria-label={formatAddress(cell)}
															onClick={() => setSelected(cell)}
														>
															{hexByte(byte)}
														</button>
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
			)}
			<div className="memory-view">
				{interpreted === null ? (
					<span className="memory-muted">Select a byte for its value</span>
				) : (
					<>
						<span className="memory-view-address">{selectedLabel}</span>
						{interpreted.map((item) => (
							<span className="memory-view-item" key={item.width}>
								<span className="memory-muted">u{item.width * 8}</span>{" "}
								<span className="memory-value">
									{hexValue(item.value, item.width)}
								</span>
								{item.partial && <span className="memory-partial">partial</span>}
							</span>
						))}
					</>
				)}
			</div>
		</div>
	);
}
