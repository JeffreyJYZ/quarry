import { GOTO_RESULT_LIMIT } from "@/lib/consts/goto";
import { useEffect, useMemo, useRef, useState } from "react";
import { lspSymbols, lspWorkspaceSymbols, type WorkspaceSymbol } from "@/lib/project/api";
import { symbolFailureNotice } from "@/lib/lsp/errors";
import { isInsideRoot } from "@/lib/lsp/paths";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import { useRunningSessions } from "@/lib/lsp/useLspContext";
import { RUST_ANALYZER } from "@/lib/consts/lsp";
import { useDialogFocus } from "@/ui/app/useDialogFocus";
import "@/ui/goto/goto.css";
import GotoInput from "@/ui/goto/GotoInput";
import GotoList from "@/ui/goto/GotoList";
import { type GotoMode, type Row, TITLES, filterRows } from "./gotoModel";
import { fileName } from "@/lib/project/paths";
export type { GotoMode } from "./gotoModel";
export { filterRows } from "./gotoModel";
export type GotoProps = {
	mode: GotoMode;
	root: string;
	/** Active file, needed by the document-symbol mode. */
	path: string | null;
	/** Recent files for the recent mode, newest first. */
	recent: string[];
	onOpen: (path: string, line: number, character: number) => void;
	onClose: () => void;
	onNotice?: (message: string) => void;
};

/**
 * Name a failed symbol read, unless a restart tore the session down mid-flight.
 *
 * The palette's effect re-runs when the running set changes, so a refusal that only means "the server
 * was not quite up" is left unsaid and answered by that re-run. Module level on purpose: a listener
 * defined in the component would change identity every render and re-trigger the effect.
 */
function reportSymbolFailure(error: unknown, onNotice?: (message: string) => void): void {
	const notice = symbolFailureNotice(error, "symbols unavailable: ");
	if (notice !== null) onNotice?.(notice);
}
/**
 * One palette for the three "go to" gestures.
 *
 * Class and symbol modes ask the language server; recent mode takes the caller's history, so it
 * still works before the server has answered anything.
 */
export default function Goto({ mode, root, path, recent, onOpen, onClose, onNotice }: GotoProps) {
	const [query, setQuery] = useState("");
	const [rows, setRows] = useState<Row[]>([]);
	const [active, setActive] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const running = useRunningSessions();
	const { panelRef, onKeyDown } = useDialogFocus(true);
	useEffect(() => {
		inputRef.current?.focus();
	}, []);
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			if (mode === "recent") {
				setRows(
					recent.map((file) => ({
						key: file,
						label: fileName(file),
						detail: file,
						path: file,
						line: 0,
						character: 0,
					})),
				);
				return;
			}
			setLoading(true);
			try {
				if (mode === "symbol") {
					let symbols: Awaited<ReturnType<typeof lspSymbols>> = [];
					if (path !== null && isInsideRoot(root, path)) {
						const kind = servedByRunningServer(path, running);
						if (kind !== null) {
							symbols = await lspSymbols(sessionId(kind, root), path).catch((err) => {
								reportSymbolFailure(err, onNotice);
								return [];
							});
						}
					}
					if (cancelled) return;
					setRows(
						symbols.map((symbol) => ({
							key: `${path ?? ""}:${symbol.range.start.line}:${symbol.name}`,
							label: symbol.name,
							detail: `${"  ".repeat(symbol.depth)}${path === null ? "" : fileName(path)}:${symbol.range.start.line + 1}`,
							path: path ?? "",
							line: symbol.range.start.line,
							character: symbol.range.start.character,
						})),
					);
				} else {
					// Workspace symbols come from rust-analyzer alone, and only while it is up: a
					// session id composed before it answered is the same premature request the panels
					// had, so the running set is a dependency and its arrival retries this load.
					const symbols: WorkspaceSymbol[] = running.has(RUST_ANALYZER)
						? await lspWorkspaceSymbols(sessionId(RUST_ANALYZER, root), query).catch(
								(err) => {
									reportSymbolFailure(err, onNotice);
									return [];
								},
							)
						: [];
					if (cancelled) return;
					setRows(
						symbols.map((symbol) => ({
							key: `${symbol.path}:${symbol.line}:${symbol.name}`,
							label: symbol.name,
							detail: `${symbol.container === "" ? "" : `${symbol.container} · `}${fileName(symbol.path)}:${symbol.line + 1}`,
							path: symbol.path,
							line: symbol.line,
							character: symbol.character,
						})),
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
		// The class mode is the only one that re-queries as the query changes.
	}, [mode, path, recent, root, query, onNotice, running]);
	const visible = useMemo(
		() => filterRows(rows, query).slice(0, GOTO_RESULT_LIMIT),
		[query, rows],
	);
	useEffect(() => {
		const item = listRef.current?.children[active] as HTMLElement | undefined;
		item?.scrollIntoView({ block: "nearest" });
	}, [active]);
	return (
		<div
			className="goto-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="goto-panel"
				role="dialog"
				aria-modal="true"
				aria-label={TITLES[mode]}
				tabIndex={-1}
				ref={panelRef}
				onKeyDown={onKeyDown}
			>
				<header className="goto-head">
					<span className="label">{TITLES[mode]}</span>
					{loading ? <span className="goto-loading">searching…</span> : null}
					<button type="button" className="goto-close" onClick={onClose}>
						esc
					</button>
				</header>
				<GotoInput
					query={query}
					placeholder={mode === "recent" ? "Filter recent files" : "Name"}
					inputRef={inputRef}
					rows={visible}
					active={active}
					onQuery={(next) => {
						setQuery(next);
						setActive(0);
					}}
					onActive={setActive}
					onClose={onClose}
					onOpen={(row) => {
						onOpen(row.path, row.line, row.character);
						onClose();
					}}
				/>
				<GotoList
					rows={visible}
					active={active}
					loading={loading}
					listRef={listRef}
					onHover={setActive}
					onPick={(row) => {
						onOpen(row.path, row.line, row.character);
						onClose();
					}}
				/>
			</div>
		</div>
	);
}
