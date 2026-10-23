import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerateItem } from "@/lib/generate/model";
import "@/ui/goto/goto.css";

export type GenerateProps = {
	items: GenerateItem[];
	onPick: (item: GenerateItem) => void;
	onClose: () => void;
};

/** The Generate menu: a short list of snippets computed from the file under the caret. */
export default function Generate({ items, onPick, onClose }: GenerateProps) {
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLUListElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		panelRef.current?.focus();
	}, []);

	useEffect(() => {
		const item = listRef.current?.children[active] as HTMLElement | undefined;
		item?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const empty = useMemo(() => items.length === 0, [items.length]);

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
				aria-label="Generate"
				tabIndex={-1}
				ref={panelRef}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
						return;
					}
					if (event.key === "ArrowDown") {
						event.preventDefault();
						setActive((current) => Math.min(current + 1, items.length - 1));
						return;
					}
					if (event.key === "ArrowUp") {
						event.preventDefault();
						setActive((current) => Math.max(current - 1, 0));
						return;
					}
					if (event.key === "Enter") {
						event.preventDefault();
						const item = items[active];
						if (item !== undefined) {
							onPick(item);
							onClose();
						}
					}
				}}
			>
				<header className="goto-head">
					<span className="label">generate</span>
					<button type="button" className="goto-close" onClick={onClose}>
						esc
					</button>
				</header>
				<ul className="goto-list" ref={listRef}>
					{empty ? (
						<li className="goto-empty">
							Nothing to generate here: put the caret inside a struct or class, or
							open a Rust or C/C++ file.
						</li>
					) : (
						items.map((item, index) => (
							<li key={item.id}>
								<button
									type="button"
									className={index === active ? "goto-row active" : "goto-row"}
									onMouseEnter={() => setActive(index)}
									onClick={() => {
										onPick(item);
										onClose();
									}}
								>
									<span className="goto-label">{item.label}</span>
									<span className="goto-detail">
										{item.insert === "end" ? "append to file" : "at the caret"}
									</span>
								</button>
							</li>
						))
					)}
				</ul>
			</div>
		</div>
	);
}
