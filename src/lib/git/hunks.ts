export type Hunk = {
	id: string;
	header: string;
	body: string[];
};

function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

export function splitHunks(diff: string): Hunk[] {
	const lines = diff.split("\n");
	const hunks: Hunk[] = [];
	let current: { header: string; body: string[] } | null = null;
	for (const line of lines) {
		if (line.startsWith("@@")) {
			if (current !== null) {
				hunks.push({
					id: hash(`${current.header}\n${current.body.join("\n")}`),
					header: current.header,
					body: current.body,
				});
			}
			current = { header: line, body: [] };
		} else if (current !== null) {
			current.body.push(line);
		}
	}
	if (current !== null) {
		hunks.push({
			id: hash(`${current.header}\n${current.body.join("\n")}`),
			header: current.header,
			body: current.body,
		});
	}
	return hunks;
}
