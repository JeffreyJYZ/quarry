import { useEffect, useRef, useState } from "react";
import { type DisassembledInstruction, dapDisassemble } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { formatAddress, parseAddress } from "@/lib/debug/memory/hex";
import "@/ui/debug/memory/memory.css";

const COUNTS = [16, 64, 128];
const DEFAULT_COUNT = 64;

type Request = {
	address: bigint;
	count: number;
	/** Bumped per fetch so a repeat fetch of the same address is a real dependency change. */
	serial: number;
};

function requestFor(address: string | null): Request | null {
	const start = parseAddress(address);
	return start === null ? null : { address: start, count: DEFAULT_COUNT, serial: 0 };
}

export type DisasmPaneProps = {
	session: string;
	/** Instruction pointer, with or without `0x`; `null` means no frame is selected. */
	address: string | null;
};

/**
 * Disassembly around the selected instruction pointer. `supportsMemoryReferences` is false on
 * lldb-dap while frames still carry `instructionPointerReference`; the caller passes that address
 * straight through, so nothing here inspects capabilities.
 */
export default function DisasmPane({ session, address }: DisasmPaneProps) {
	const [request, setRequest] = useState<Request | null>(() => requestFor(address));
	const [rows, setRows] = useState<DisassembledInstruction[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	/** Bumped per fetch so an older reply can never overwrite a newer one. */
	const sequence = useRef(0);

	const count = request?.count ?? DEFAULT_COUNT;

	useEffect(() => {
		const next = parseAddress(address);
		setCopied(false);
		setRequest((previous) => {
			if (next === null) {
				return null;
			}
			if (previous !== null && previous.address === next) {
				return previous;
			}
			return { address: next, count: previous?.count ?? DEFAULT_COUNT, serial: 0 };
		});
	}, [address]);

	useEffect(() => {
		if (request === null) {
			sequence.current += 1;
			setRows(null);
			setError(null);
			setBusy(false);
			return;
		}
		const { address: start, count: wanted } = request;
		sequence.current += 1;
		const ticket = sequence.current;
		let live = true;
		setBusy(true);
		const load = async () => {
			try {
				const next = await dapDisassemble(session, formatAddress(start), wanted);
				if (!live || ticket !== sequence.current) {
					return;
				}
				setRows(next);
				setError(null);
			} catch (failure) {
				if (!live || ticket !== sequence.current) {
					return;
				}
				setRows(null);
				setError(describeError(failure));
			} finally {
				if (live && ticket === sequence.current) {
					setBusy(false);
				}
			}
		};
		void load();
		return () => {
			live = false;
		};
	}, [session, request]);

	const changeCount = (value: number) => {
		setRequest((previous) =>
			previous === null ? null : { ...previous, count: value, serial: previous.serial + 1 },
		);
	};

	const refresh = () => {
		setCopied(false);
		setRequest((previous) =>
			previous === null ? null : { ...previous, serial: previous.serial + 1 },
		);
	};

	const copy = async () => {
		if (rows === null || rows.length === 0) {
			return;
		}
		const text = rows
			.map((row) => {
				const symbol = row.symbol === null ? "" : `\t${row.symbol}`;
				return `${row.address}\t${row.instruction}${symbol}`;
			})
			.join("\n");
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setError(null);
		} catch (failure) {
			setCopied(false);
			setError(`Copy failed: ${describeError(failure)}`);
		}
	};

	const active = parseAddress(address);
	const empty = active === null;

	return (
		<div className="memory-pane">
			<div className="memory-head">
				<label className="memory-field memory-field-narrow">
					<span className="memory-label">Count</span>
					<select
						className="memory-select"
						value={String(count)}
						aria-label="Instruction count"
						onChange={(event) => changeCount(Number(event.target.value))}
					>
						{COUNTS.map((value) => (
							<option key={value} value={String(value)}>
								{value}
							</option>
						))}
					</select>
				</label>
				<button type="button" className="button" disabled={empty} onClick={refresh}>
					Refresh
				</button>
				<button
					type="button"
					className={copied ? "button active" : "button"}
					disabled={rows === null || rows.length === 0}
					onClick={() => {
						void copy();
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
				{active !== null && (
					<span className="memory-muted memory-head-note">{formatAddress(active)}</span>
				)}
				{busy && <span className="memory-muted memory-head-note">loading</span>}
			</div>
			{error !== null && <p className="memory-error">{error}</p>}
			{empty ? (
				<p className="memory-empty">No frame selected</p>
			) : rows === null ? (
				<p className="memory-empty">{busy ? "Disassembling…" : "No instructions loaded"}</p>
			) : rows.length === 0 ? (
				<p className="memory-empty">The adapter returned no instructions</p>
			) : (
				<ol className="disasm-list">
					{rows.map((row) => {
						const current = parseAddress(row.address) === active;
						return (
							<li
								className={current ? "disasm-row active" : "disasm-row"}
								key={row.address}
							>
								<span className="disasm-addr">{row.address}</span>
								<span className="disasm-code">{row.instruction}</span>
								{row.symbol !== null && (
									<span className="disasm-symbol">{row.symbol}</span>
								)}
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
