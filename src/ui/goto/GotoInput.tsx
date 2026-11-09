import type { KeyboardEvent, RefObject } from "react";
import type { Row } from "./gotoModel";

/**
 * The prompt line of a "go to" palette.
 *
 * Tab and the arrows move the highlight rather than the focus, because the list is what is being
 * chosen; focus stays in the box, and the dialog's own trap closes Tab from anywhere else.
 */
export default function GotoInput({
	query,
	placeholder,
	inputRef,
	rows,
	active,
	onQuery,
	onActive,
	onClose,
	onOpen,
}: {
	query: string;
	placeholder: string;
	inputRef: RefObject<HTMLInputElement | null>;
	rows: Row[];
	active: number;
	onQuery: (query: string) => void;
	onActive: (index: number) => void;
	onClose: () => void;
	onOpen: (row: Row) => void;
}) {
	const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			onActive(Math.min(Math.max(active + step, 0), rows.length - 1));
			return;
		}
		if (event.key === "Tab") {
			event.preventDefault();
			const step = event.shiftKey ? -1 : 1;
			onActive(Math.min(Math.max(active + step, 0), rows.length - 1));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			const row = rows[active];
			if (row !== undefined) onOpen(row);
		}
	};

	return (
		<input
			ref={inputRef}
			className="goto-input"
			type="text"
			value={query}
			placeholder={placeholder}
			spellCheck={false}
			onChange={(event) => onQuery(event.target.value)}
			onKeyDown={handleKey}
		/>
	);
}
