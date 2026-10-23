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
					id: hash(current.header + "\n" + current.body.join("\n")),
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
			id: hash(current.header + "\n" + current.body.join("\n")),
			header: current.header,
			body: current.body,
		});
	}
	return hunks;
}

export function hunkPatch(diff: string, id: string): string | null {
	const hunks = splitHunks(diff);
	const target = hunks.find((hunk) => hunk.id === id);
	if (target === undefined) return null;
	const headerLines = diff
		.split("\n")
		.filter(
			(line) =>
				!line.startsWith("@@") &&
				(line.startsWith("diff ") ||
					line.startsWith("---") ||
					line.startsWith("+++ ") ||
					line.startsWith("index ") ||
					line.startsWith("new file") ||
					line.startsWith("deleted file") ||
					line.startsWith("old mode") ||
					line.startsWith("new mode")),
		);
	const patch = [...headerLines, target.header, ...target.body].join("\n");
	return patch;
}
