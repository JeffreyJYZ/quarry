import type { ReactNode } from "react";

/** Inline monochrome glyphs for the terminal chrome: 16px, stroked with the current colour. */
function Glyph({ children }: { children: ReactNode }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{children}
		</svg>
	);
}

export function TerminalIcon() {
	return (
		<Glyph>
			<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
			<path d="M4.6 6.2 6.9 8.5l-2.3 2.3" />
			<path d="M8.6 10.8h2.9" />
		</Glyph>
	);
}

export function PlusIcon() {
	return (
		<Glyph>
			<path d="M8 3.5v9M3.5 8h9" />
		</Glyph>
	);
}

export function CopyIcon() {
	return (
		<Glyph>
			<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
			<path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
		</Glyph>
	);
}

export function RestartIcon() {
	return (
		<Glyph>
			<path d="M14 8a6 6 0 1 1-6-6c1.68 0 3.29.67 4.49 1.83L14 5.33" />
			<path d="M14 2v3.33h-3.33" />
		</Glyph>
	);
}

export function TrashIcon() {
	return (
		<Glyph>
			<path d="M2 4h12" />
			<path d="M5.33 4V2.67a1.33 1.33 0 0 1 1.33-1.33h2.67a1.33 1.33 0 0 1 1.33 1.33V4" />
			<path d="M12.67 4v9.33a1.33 1.33 0 0 1-1.33 1.33H4.67a1.33 1.33 0 0 1-1.33-1.33V4" />
		</Glyph>
	);
}

export function FontUpIcon() {
	return (
		<Glyph>
			<path d="M2.4 12.5 5.6 3.4l3.2 9.1" />
			<path d="M3.8 9.6h3.6" />
			<path d="M12.2 6.6v4.6M9.9 8.9h4.6" />
		</Glyph>
	);
}

export function FontDownIcon() {
	return (
		<Glyph>
			<path d="M2.4 12.5 5.6 3.4l3.2 9.1" />
			<path d="M3.8 9.6h3.6" />
			<path d="M9.9 8.9h4.6" />
		</Glyph>
	);
}
