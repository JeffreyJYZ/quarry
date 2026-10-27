import { useEffect, useRef, useState } from "react";
import { formatAddress, parseAddress } from "@/lib/debug/memory/hex";
import { type DisassembledInstruction, dapDisassemble } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import DisasmBar from "@/ui/debug/memory/DisasmBar";
import DisasmList from "@/ui/debug/memory/DisasmList";
import "@/ui/debug/memory/memory.css";

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
	session: string | null;
	/** Instruction pointer, with or without `0x`; `null` means no frame is selected. */
	address: string | null;
};

/**
 * Disassembly around the instruction pointer, with its own address field so an arbitrary address
 * can be inspected without moving the debuggee. `supportsMemoryReferences` is false on lldb-dap
 * while frames still carry `instructionPointerReference`; the caller passes that address straight
 * through, so nothing here inspects capabilities.
 */
export default function DisasmPane({ session, address }: DisasmPaneProps) {
	const [request, setRequest] = useState<Request | null>(() => requestFor(address));
	const [input, setInput] = useState(() => formatAddress(parseAddress(address)));
	const [rows, setRows] = useState<DisassembledInstruction[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	/** Bumped per fetch so an older reply can never overwrite a newer one. */
	const sequence = useRef(0);

	const count = request?.count ?? DEFAULT_COUNT;

	// Re-seed the field from the instruction pointer on every stop.
	useEffect(() => {
		const next = parseAddress(address);
		setCopied(false);
		setInput(formatAddress(next));
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
		if (request === null || session === null) {
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

	const go = () => {
		const next = parseAddress(input);
		if (next === null) {
			setError(
				input.trim() === "" ? "Enter a hexadecimal address" : "Not a hexadecimal address",
			);
			return;
		}
		setError(null);
		setRequest({ address: next, count, serial: (request?.serial ?? 0) + 1 });
	};

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

	return (
		<div className="memory-pane">
			<DisasmBar
				input={input}
				onInputChange={setInput}
				onGo={go}
				count={count}
				onCountChange={changeCount}
				onRefresh={refresh}
				onCopy={() => void copy()}
				copied={copied}
				canCopy={rows !== null && rows.length > 0}
				busy={busy}
			/>
			{error !== null && (
				<p className="memory-error" role="alert">
					{error}
				</p>
			)}
			{session === null ? (
				<p className="memory-empty">No session: launch or attach to disassemble</p>
			) : request === null ? (
				<p className="memory-empty">No address: stop somewhere or type one above</p>
			) : rows === null ? (
				<p className="memory-empty">{busy ? "Disassembling…" : "No instructions loaded"}</p>
			) : rows.length === 0 ? (
				<p className="memory-empty">The adapter returned no instructions</p>
			) : (
				<DisasmList rows={rows} active={request.address} />
			)}
		</div>
	);
}
