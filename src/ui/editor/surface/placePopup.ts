export type Anchor = { left: number; top: number; bottom: number };
export type PopupSize = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type Placement = { top?: number; bottom?: number; left: number };

const MARGIN = 8;
const GAP = 4;

export function placePopup(anchor: Anchor, size: PopupSize, viewport: Viewport): Placement {
	const spaceBelow = viewport.height - anchor.bottom;
	const spaceAbove = anchor.top;
	const above = spaceBelow < Math.min(size.height, 200) && spaceAbove > spaceBelow;
	let left = anchor.left;
	if (left + size.width > viewport.width - MARGIN) left = anchor.left - size.width;
	left = Math.max(MARGIN, Math.min(left, Math.max(MARGIN, viewport.width - size.width - MARGIN)));
	return above
		? { bottom: viewport.height - anchor.top + GAP, left }
		: { top: anchor.bottom + GAP, left };
}
