import type { ReactNode } from "react";

export function highlight(text: string, indices: number[]): ReactNode {
	const set = new Set(indices);
	const parts: React.ReactNode[] = [];
	let buffer = "";
	for (let i = 0; i < text.length; i++) {
		if (set.has(i)) {
			if (buffer.length > 0) {
				parts.push(<span key={`t-${i}`}>{buffer}</span>);
				buffer = "";
			}
			parts.push(
				<span key={`h-${i}`} className="quick-open-hit">
					{text[i]}
				</span>,
			);
		} else {
			buffer += text[i];
		}
	}
	if (buffer.length > 0) parts.push(<span key="tail">{buffer}</span>);
	return parts.length === 0 ? text : parts;
}
