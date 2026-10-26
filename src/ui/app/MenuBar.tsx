import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuGroup } from "@/ui/app/menuGroups";
import type { MenuItem } from "@/ui/app/menuGroups";

export type MenuBarProps = {
	items: { id: string; label: string; disabled?: boolean; run: () => void }[];
	groups: MenuGroup[];
	onRun: (id: string) => void;
	disabled: (id: string) => boolean;
};

export default function MenuBar({ items, groups, onRun, disabled }: MenuBarProps) {
	const [openGroup, setOpenGroup] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const itemById = useCallback((id: string) => items.find((item) => item.id === id), [items]);

	const flatItems = useCallback(
		(group: MenuGroup) =>
			group.items.filter((entry): entry is MenuItem => typeof entry !== "string"),
		[],
	);

	useEffect(() => {
		if (openGroup === null) return;
		const handlePointer = (event: MouseEvent) => {
			if (rootRef.current?.contains(event.target as Node) === true) return;
			setOpenGroup(null);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpenGroup(null);
				return;
			}
			if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
			const group = groups.find((g) => g.label === openGroup);
			if (group === undefined) return;
			const ids = flatItems(group).map((item) => item.id);
			if (ids.length === 0) return;
			event.preventDefault();
			const current = itemRefs.current.indexOf(
				document.activeElement as HTMLButtonElement | null,
			);
			const next =
				event.key === "ArrowDown"
					? Math.min(current + 1, ids.length - 1)
					: Math.max(current - 1, 0);
			itemRefs.current[next]?.focus();
		};
		document.addEventListener("mousedown", handlePointer);
		window.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handlePointer);
			window.removeEventListener("keydown", handleKey);
		};
	}, [openGroup, groups, flatItems]);

	const open = (label: string) => {
		setOpenGroup(label);
	};

	const activate = (id: string) => {
		if (disabled(id)) return;
		setOpenGroup(null);
		// The parent owns dispatch: it also serves the native menu, so there is one path.
		onRun(id);
	};

	return (
		<div className="menubar" role="menubar" ref={rootRef}>
			{groups.map((group) => {
				const isOpen = openGroup === group.label;
				const ids = flatItems(group).map((item) => item.id);
				return (
					<div className="menubar-group" key={group.label}>
						<button
							type="button"
							className="menubar-trigger"
							aria-haspopup="menu"
							aria-expanded={isOpen}
							onClick={() => (isOpen ? setOpenGroup(null) : open(group.label))}
							onKeyDown={(event) => {
								if (
									event.key === "ArrowDown" ||
									event.key === "Enter" ||
									event.key === " "
								) {
									event.preventDefault();
									open(group.label);
								}
							}}
						>
							{group.label}
						</button>
						{isOpen ? (
							<div className="menubar-panel" role="menu">
								{group.items.map((entry, index) => {
									if (entry === "separator") {
										// biome-ignore lint/suspicious/noArrayIndexKey: separators have no stable id
										return <hr key={`sep-${index}`} className="menubar-sep" />;
									}
									const isDisabled = disabled(entry.id);
									const menuItem = itemById(entry.id);
									const position = ids.indexOf(entry.id);
									return (
										<button
											type="button"
											key={entry.id}
											role="menuitem"
											ref={(node) => {
												itemRefs.current[position] = node;
											}}
											className={
												isDisabled
													? "menubar-item disabled"
													: "menubar-item"
											}
											disabled={isDisabled}
											onClick={() => activate(entry.id)}
										>
											<span className="menubar-item-label">
												{entry.label ?? menuItem?.label}
											</span>
											{entry.accel ? (
												<span className="menubar-accel">{entry.accel}</span>
											) : null}
										</button>
									);
								})}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
