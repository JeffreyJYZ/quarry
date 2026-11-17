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
	/**
	 * The row the user chose, tagged with the file it was chosen in.
	 *
	 * The highlight is derived from this plus the caret, never assigned by an effect: an effect runs
	 * a commit after the rows, so the list would paint once with the wrong row highlighted and then
	 * jump — a visible flicker, and the frame the old test caught only by luck. The file tag keeps a
	 * choice made in one file from pointing at an unrelated row in the next.
	 */
	const [picked, setPicked] = useState<{ path: string | null; index: number } | null>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const { panelRef, onKeyDown } = useDialogFocus(true, {
		initialFocus: ".goto-input",
		onClose,
	});

	const rows = useMemo(() => structureRows(symbols, query), [symbols, query]);
	const caret = useMemo(() => caretSymbolIndex(symbols, cursor), [symbols, cursor]);
	const status = structureStatus({
		source,
		loading,
		error,
		symbolCount: symbols.length,
		rowCount: rows.length,
	});

	// The caret's symbol is what the popup is usually asked for, and it is only known once the
	// server answers; deriving it means the very first frame that has rows already carries it.
	const chosen = picked !== null && picked.path === activePath ? picked.index : null;
	const seed = initialActive(rows, caret);
	const active = clampActive(chosen ?? seed, rows.length);

	useEffect(() => {
		const item = listRef.current?.children[active] as HTMLElement | undefined;
		item?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const pick = (symbol: LspSymbol) => {
		if (activePath === null) return;
		onNavigate(activePath, symbol.range.start.line, symbol.range.start.character);
		onClose();
	};

	const choose = (index: number) => {
		setPicked({ path: activePath, index });
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
						choose(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							choose(stepActive(active, rows.length, 1));
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							choose(stepActive(active, rows.length, -1));
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
						onHover={choose}
						onPick={pick}
					/>
				)}
			</div>
		</div>
	);
}
