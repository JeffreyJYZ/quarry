import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dapReadMemory, dapWriteMemory } from "@/project/api";
import { describeError } from "@/project/errors";
import {
	asciiByte,
	buildRows,
	CHUNK_BYTES,
	formatAddress,
	formatHexText,
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

	const [editMode, setEditMode] = useState(false);
	const [editing, setEditing] = useState<bigint | null>(null);
	const [editValue, setEditValue] = useState("");
	const [rangeAnchor, setRangeAnchor] = useState<bigint | null>(null);
	const [rangeEnd, setRangeEnd] = useState<bigint | null>(null);
	const [rangeInput, setRangeInput] = useState("");
	const [history, setHistory] = useState<bigint[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [copied, setCopied] = useState<string | null>(null);
	const copiedTimer = useRef<number | null>(null);

	const pageSize = request?.size ?? DEFAULT_PAGE;

	const recordVisit = useCallback(
		(next: bigint) => {
			setHistory((previous) => {
				const base = previous.slice(0, historyIndex + 1);
				if (base.length > 0 && base[base.length - 1] === next) {
					return previous;
				}
				const nextHistory = [...base, next];
				const sliced =
					nextHistory.length > 20
						? nextHistory.slice(nextHistory.length - 20)
						: nextHistory;
				setHistoryIndex(sliced.length - 1);
				return sliced;
			});
		},
		[historyIndex],
	);

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
		recordVisit(next);
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

	let rangeStart: bigint | null = null;
	let rangeFinish: bigint | null = null;
	if (rangeAnchor !== null && rangeEnd !== null) {
		if (rangeAnchor < rangeEnd) {
			rangeStart = rangeAnchor;
			rangeFinish = rangeEnd;
		} else {
			rangeStart = rangeEnd;
			rangeFinish = rangeAnchor;
		}
	}
	const rangeLabel =
		rangeStart !== null && rangeFinish !== null
			? `${formatAddress(rangeStart)}–${formatAddress(rangeFinish)}`
			: null;
	const rangeSize =
		rangeStart !== null && rangeFinish !== null ? Number(rangeFinish - rangeStart + 1n) : 0;

	const commitEdit = async (cell: bigint) => {
		if (!session) {
			setEditing(null);
			return;
		}
		if (editValue.length !== 2) {
			setEditing(null);
			return;
		}
		const value = Number.parseInt(editValue, 16);
		if (Number.isNaN(value)) {
			setEditing(null);
			return;
		}
		try {
			await dapWriteMemory(session, formatAddress(cell), [value]);
			setEditing(null);
			setRequest((previous) =>
				previous === null ? null : { ...previous, serial: previous.serial + 1 },
			);
		} catch (failure) {
			setError(describeError(failure));
			setEditing(null);
		}
	};

	const goBack = () => {
		if (historyIndex <= 0) {
			return;
		}
		const nextIndex = historyIndex - 1;
		const next = history[nextIndex];
		setHistoryIndex(nextIndex);
		setInput(formatAddress(next));
		setSelected(null);
		setError(null);
		setRequest((previous) => ({
			start: next,
			size: previous?.size ?? DEFAULT_PAGE,
			serial: (previous?.serial ?? 0) + 1,
		}));
	};

	const goForward = () => {
		if (historyIndex >= history.length - 1) {
			return;
		}
		const nextIndex = historyIndex + 1;
		const next = history[nextIndex];
		setHistoryIndex(nextIndex);
		setInput(formatAddress(next));
		setSelected(null);
		setError(null);
		setRequest((previous) => ({
			start: next,
			size: previous?.size ?? DEFAULT_PAGE,
			serial: (previous?.serial ?? 0) + 1,
		}));
	};

	const flashCopied = (text: string) => {
		setCopied(text);
		if (copiedTimer.current !== null) {
			window.clearTimeout(copiedTimer.current);
		}
		copiedTimer.current = window.setTimeout(() => setCopied(null), 2000);
	};

	const copyHex = async () => {
		if (loaded === null) {
			return;
		}
		try {
			await navigator.clipboard.writeText(formatHexText(loaded.base, loaded.bytes));
		} catch (failure) {
			setError(describeError(failure));
		}
	};

	const copyAddress = async (target: bigint) => {
		const text = formatAddress(target);
		try {
			await navigator.clipboard.writeText(text);
			flashCopied(text);
		} catch (failure) {
			setError(describeError(failure));
		}
	};

	const commitRange = useCallback(async () => {
		if (!session || rangeStart === null || rangeFinish === null) {
			return;
		}
		if (rangeInput.length !== rangeSize * 2) {
			return;
		}
		const bytes: number[] = [];
		for (let index = 0; index < rangeSize; index += 1) {
			bytes.push(Number.parseInt(rangeInput.slice(index * 2, index * 2 + 2), 16));
		}
		if (bytes.some((value) => Number.isNaN(value))) {
			return;
		}
		try {
			await dapWriteMemory(session, formatAddress(rangeStart), bytes);
			setRangeInput("");
			setRequest((previous) =>
				previous === null ? null : { ...previous, serial: previous.serial + 1 },
			);
		} catch (failure) {
			setError(describeError(failure));
		}
	}, [session, rangeStart, rangeFinish, rangeSize, rangeInput]);

	useEffect(() => {
		if (!editMode || rangeStart === null || rangeFinish === null) {
			return;
		}
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target !== null &&
				(target.tagName === "INPUT" ||
					target.tagName === "SELECT" ||
					target.tagName === "TEXTAREA")
			) {
				return;
			}
			if (event.key === "Escape") {
				setRangeInput("");
				setRangeAnchor(null);
				setRangeEnd(null);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				void commitRange();
				return;
			}
			if (event.key === "Backspace") {
				setRangeInput((value) => value.slice(0, -1));
				return;
			}
			if (/^[0-9a-fA-F]$/.test(event.key)) {
				setRangeInput((value) => {
					const next = (value + event.key).slice(0, rangeSize * 2);
					return next;
				});
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [editMode, rangeStart, rangeFinish, rangeSize, commitRange]);

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
				<button type="button" className="button" onClick={() => void copyHex()}>
					Copy
				</button>
				<button
					type="button"
					className="button"
					disabled={historyIndex <= 0}
					onClick={goBack}
				>
					Back
				</button>
				<button
					type="button"
					className="button"
					disabled={historyIndex >= history.length - 1}
					onClick={goForward}
				>
					Forward
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
				<button
					type="button"
					className={editMode ? "button active" : "button"}
					aria-pressed={editMode}
					onClick={() => setEditMode((value) => !value)}
				>
					Edit
				</button>
				{rangeLabel !== null && (
					<span className="memory-muted memory-head-note">
						{rangeLabel}
						{rangeInput !== "" ? ` ${rangeInput}` : ""}
					</span>
				)}
				{busy && <span className="memory-muted memory-head-note">reading</span>}
			</div>
			{error !== null && <p className="memory-error">{error}</p>}
			{copied !== null && <p className="memory-muted">{`Copied ${copied}`}</p>}
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
									<button
										type="button"
										className="memory-addr"
										onClick={() => void copyAddress(row.address)}
									>
										{formatRowAddress(row.address, row.digits)}
									</button>
									{unreadable ? (
										<span className="memory-band">unmapped</span>
									) : (
										<>
											<span className="memory-cells">
												{row.bytes.map((byte, index) => {
													const cell = row.address + BigInt(index);
													const current = selected === cell;
													const inRange =
														rangeStart !== null &&
														rangeFinish !== null &&
														cell >= rangeStart &&
														cell <= rangeFinish;
													if (editing === cell) {
														return (
															<input
																key={cell.toString(16)}
																className="memory-cell memory-cell-edit"
																value={editValue}
																spellCheck={false}
																autoComplete="off"
																maxLength={2}
																aria-label={formatAddress(cell)}
																onChange={(event) => {
																	const filtered =
																		event.target.value
																			.replace(
																				/[^0-9a-fA-F]/g,
																				"",
																			)
																			.slice(0, 2);
																	setEditValue(filtered);
																}}
																onKeyDown={(event) => {
																	if (event.key === "Enter") {
																		event.preventDefault();
																		void commitEdit(cell);
																	} else if (
																		event.key === "Escape"
																	) {
																		event.preventDefault();
																		setEditing(null);
																		setEditValue("");
																	} else if (
																		event.key === "Tab"
																	) {
																		event.preventDefault();
																		void commitEdit(cell).then(
																			() => {
																				const nextCell =
																					cell + 1n;
																				const nextByte =
																					loaded !==
																						null &&
																					nextCell >=
																						loaded.base &&
																					nextCell <
																						loaded.base +
																							BigInt(
																								loaded.size,
																							)
																						? loaded
																								.bytes[
																								Number(
																									nextCell -
																										loaded.base,
																								)
																							]
																						: null;
																				if (
																					nextByte !==
																					null
																				) {
																					setEditing(
																						nextCell,
																					);
																					setEditValue(
																						hexByte(
																							nextByte,
																						),
																					);
																				}
																			},
																		);
																	}
																}}
															/>
														);
													}
													return (
														<button
															type="button"
															className={
																current || inRange
																	? "memory-cell selected"
																	: "memory-cell"
															}
															key={cell.toString(16)}
															aria-label={formatAddress(cell)}
															onClick={(event) => {
																if (event.shiftKey) {
																	if (rangeAnchor === null) {
																		setRangeAnchor(cell);
																	} else {
																		setRangeEnd(cell);
																	}
																	return;
																}
																setSelected(cell);
																setRangeAnchor(null);
																setRangeEnd(null);
																setRangeInput("");
															}}
															onDoubleClick={() => {
																if (!editMode || !session) {
																	return;
																}
																if (byte === null) {
																	return;
																}
																setEditing(cell);
																setEditValue(hexByte(byte));
															}}
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
