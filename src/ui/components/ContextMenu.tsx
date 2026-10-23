import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
	label: string;
	onSelect: () => void;
	/** Rendered in the danger colour: destructive, or otherwise worth a second look. */
	danger?: boolean;
	/** A group break above this item. */
	separated?: boolean;
	disabled?: boolean;
};

/**
 * A menu anchored at a point, the way a right click opens one.
 *
 * It renders at the pointer, then nudges itself inside the viewport once it has a measured size, so
 * a click near the bottom edge never opens a menu half off screen.
 */
export default function ContextMenu({
	x,
	y,
	items,
	onClose,
}: {
	x: number;
	y: number;
	items: MenuItem[];
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState({ left: x, top: y });

	useLayoutEffect(() => {
		const node = ref.current;
		if (node === null) return;
		const box = node.getBoundingClientRect();
		const left = Math.min(x, window.innerWidth - box.width - 8);
		const top = Math.min(y, window.innerHeight - box.height - 8);
		setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
	}, [x, y]);

	useEffect(() => {
		const close = () => onClose();
		const onPointer = (event: MouseEvent) => {
			if (ref.current?.contains(event.target as Node) === true) return;
			onClose();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", onPointer);
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("blur", close);
		window.addEventListener("resize", close);
		document.addEventListener("scroll", close, true);
		return () => {
			document.removeEventListener("mousedown", onPointer);
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("blur", close);
			window.removeEventListener("resize", close);
			document.removeEventListener("scroll", close, true);
		};
	}, [onClose]);

	return (
		<div
			ref={ref}
			className="context-menu"
			role="menu"
			style={{ left: `${position.left}px`, top: `${position.top}px` }}
		>
			{items.map((item) => (
				<div key={item.label}>
					{item.separated === true ? <hr className="context-menu-sep" /> : null}
					<button
						type="button"
						role="menuitem"
						className={
							item.danger === true ? "context-menu-item danger" : "context-menu-item"
						}
						disabled={item.disabled}
						onClick={() => {
							onClose();
							item.onSelect();
						}}
					>
						{item.label}
					</button>
				</div>
			))}
		</div>
	);
}
