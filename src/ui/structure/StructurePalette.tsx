import { useEffect, useMemo, useRef, useState } from "react";
import { caretSymbolIndex } from "@/lib/outline/model";
import {
	initialActive,
	stepActive,
	structureRows,
	structureSource,
	structureStatus,
} from "@/lib/outline/structure";
import { clampActive } from "@/lib/quickopen/active";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { useDialogFocus } from "@/ui/app/useDialogFocus";
import StructureList from "./StructureList";
import {
	type StructureLoad,
	loadStructureSymbols,
	useStructureSymbols,
} from "./useStructureSymbols";
import "./structure.css";

export type StructurePaletteProps = {
	activePath: string | null;
	/** The live session serving the file, or null when no ready server serves it. */
	session: string | null;
	cursor: { line: number; character: number } | null;
	onNavigate: (path: string, line: number, character: number) => void;
	onClose: () => void;
	/** Test seam: how the symbols are fetched. */
	load?: StructureLoad;
};

/**
 * File Structure: the current file's symbols as a filterable list.
 *
 * The outline panel answers the same question in place; this one is for jumping, so it opens with
 * the caret's symbol selected and closes on the row that is picked.
 */
export default function StructurePalette(props: StructurePaletteProps) {
	const { activePath, session, cursor, onNavigate, onClose } = props;
	const load = props.load ?? loadStructureSymbols;
	const source = structureSource(activePath, session);
	const { symbols, loading, error } = useStructureSymbols(source, session, activePath, load);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLUListElement>(null);
	const seededFor = useRef<string | null>(null);
	const { panelRef, onKeyDown } = useDialogFocus(true, {
		initialFocus: ".goto-input",
		onClose,
	});

	const rows = useMemo(() => structureRows(symbols, query), [symbols, query]);
	const status = structureStatus({
		source,
		loading,
		error,
		symbolCount: symbols.length,
		rowCount: rows.length,
	});

	// The caret's symbol is what the popup is usually asked for and it is only known once the server
	// answers, so the first list settles on it; the per-file guard keeps a later list from moving the
	// selection the user already made. It runs after the clamp above so a new list cannot overwrite
	// the seed with the row index it held a moment ago.
	useEffect(() => {
		setActive((current) => clampActive(current, rows.length));
	}, [rows.length]);

	useEffect(() => {
		if (activePath === null || symbols.length === 0) return;
		if (seededFor.current === activePath) return;
		seededFor.current = activePath;
		setActive(initialActive(rows, caretSymbolIndex(symbols, cursor)));
	}, [activePath, symbols, rows, cursor]);

	useEffect(() => {
		const item = listRef.current?.children[active] as HTMLElement | undefined;
		item?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const pick = (symbol: LspSymbol) => {
		if (activePath === null) return;
		onNavigate(activePath, symbol.range.start.line, symbol.range.start.character);
		onClose();
	};

	const submit = () => {
		const index = rows[clampActive(active, rows.length)];
		const symbol = index === undefined ? undefined : symbols[index];
		if (symbol !== undefined) pick(symbol);
	};

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
				aria-label="File structure"
				tabIndex={-1}
				ref={panelRef}
				onKeyDown={onKeyDown}
			>
				<header className="goto-head">
					<span className="label">file structure</span>
					{loading ? <span className="goto-loading">loading…</span> : null}
					<button type="button" className="goto-close" onClick={onClose}>
						esc
					</button>
				</header>
				<input
					className="goto-input"
					value={query}
					placeholder="filter by name or kind"
					aria-label="Filter symbols"
					spellCheck={false}
					autoComplete="off"
					onInput={(event) => {
						setQuery(event.currentTarget.value);
						setActive(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActive((current) => stepActive(current, rows.length, 1));
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setActive((current) => stepActive(current, rows.length, -1));
							return;
						}
						if (event.key === "Enter") {
							event.preventDefault();
							submit();
						}
					}}
				/>
				{status !== null ? (
					<p
						className={status.tone === "error" ? "goto-empty error" : "goto-empty"}
						role="status"
					>
						{status.text}
					</p>
				) : (
					<StructureList
						symbols={symbols}
						rows={rows}
						active={active}
						listRef={listRef}
						onHover={setActive}
						onPick={pick}
					/>
				)}
			</div>
		</div>
	);
}
