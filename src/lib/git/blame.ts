import type { BlameLine } from "@/lib/project/api";

export type BlameGroup = {
	hash: string;
	author: string;
	subject: string;
	startLine: number;
	endLine: number;
	lines: BlameLine[];
};

export function groupBlame(lines: BlameLine[]): BlameGroup[] {
	const groups: BlameGroup[] = [];
	for (const line of lines) {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.hash === line.hash) {
			last.lines.push(line);
			last.endLine = line.line;
		} else {
			groups.push({
				hash: line.hash,
				author: line.author,
				subject: line.subject,
				startLine: line.line,
				endLine: line.line,
				lines: [line],
			});
		}
	}
	return groups;
}
