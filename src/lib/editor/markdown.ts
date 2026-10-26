/**
 * A deliberately small Markdown renderer for language-server hovers.
 *
 * Hover text comes from the server, so it is never trusted as HTML: every node here is built with
 * `createTextNode`, and the syntax handled is the syntax LSP hovers actually use — headings, fenced
 * code, lists, inline code, bold, italics and links.
 */

export type Block =
	| { kind: "heading"; level: number; text: string }
	| { kind: "code"; language: string; lines: string[] }
	| { kind: "list"; ordered: boolean; items: string[] }
	| { kind: "paragraph"; text: string }
	| { kind: "rule" };

export function parseMarkdown(text: string): Block[] {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];

		const fence = /^\s*```(\w*)\s*$/.exec(line);
		if (fence !== null) {
			const code: string[] = [];
			index += 1;
			while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
				code.push(lines[index]);
				index += 1;
			}
			index += 1;
			blocks.push({ kind: "code", language: fence[1] ?? "", lines: code });
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading !== null) {
			blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
			index += 1;
			continue;
		}

		const rule = /^\s{0,3}((-{3,})|(\*{3,})|(_{3,}))\s*$/.exec(line);
		if (rule !== null) {
			blocks.push({ kind: "rule" });
			index += 1;
			continue;
		}

		if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
			const ordered = /^\s*\d+\.\s+/.test(line);
			const items: string[] = [];
			while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
				items.push(lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
				index += 1;
			}
			blocks.push({ kind: "list", ordered, items });
			continue;
		}

		if (line.trim() === "") {
			index += 1;
			continue;
		}

		const paragraph: string[] = [];
		while (
			index < lines.length &&
			lines[index].trim() !== "" &&
			!/^\s*```/.test(lines[index])
		) {
			paragraph.push(lines[index]);
			index += 1;
		}
		blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
	}

	return blocks;
}

/** Inline spans: `code`, **bold**, *italic* and [text](url). Everything else is literal text. */
function appendInline(parent: HTMLElement, text: string): void {
	const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (start > last) parent.append(document.createTextNode(text.slice(last, start)));
		const token = match[0];
		if (token.startsWith("`")) {
			const code = document.createElement("code");
			code.className = "hover-md-code";
			code.textContent = token.slice(1, -1);
			parent.append(code);
		} else if (token.startsWith("**")) {
			const strong = document.createElement("strong");
			strong.textContent = token.slice(2, -2);
			parent.append(strong);
		} else if (token.startsWith("*")) {
			const emphasis = document.createElement("em");
			emphasis.textContent = token.slice(1, -1);
			parent.append(emphasis);
		} else {
			const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
			if (link === null) {
				parent.append(document.createTextNode(token));
			} else {
				const anchor = document.createElement("a");
				anchor.textContent = link[1];
				anchor.href = link[2];
				anchor.target = "_blank";
				anchor.rel = "noreferrer";
				parent.append(anchor);
			}
		}
		last = start + token.length;
	}
	if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

export function renderMarkdown(text: string): HTMLElement {
	const root = document.createElement("div");
	root.className = "hover-md";
	for (const block of parseMarkdown(text)) {
		if (block.kind === "heading") {
			const heading = document.createElement(`h${Math.min(block.level + 2, 6)}`);
			heading.className = "hover-md-heading";
			appendInline(heading, block.text);
			root.append(heading);
			continue;
		}
		if (block.kind === "code") {
			const pre = document.createElement("pre");
			pre.className = "hover-md-block";
			pre.textContent = block.lines.join("\n");
			root.append(pre);
			continue;
		}
		if (block.kind === "list") {
			const list = document.createElement(block.ordered ? "ol" : "ul");
			list.className = "hover-md-list";
			for (const item of block.items) {
				const li = document.createElement("li");
				appendInline(li, item);
				list.append(li);
			}
			root.append(list);
			continue;
		}
		if (block.kind === "rule") {
			const rule = document.createElement("hr");
			rule.className = "hover-md-rule";
			root.append(rule);
			continue;
		}
		const paragraph = document.createElement("p");
		paragraph.className = "hover-md-paragraph";
		for (const [lineIndex, line] of block.text.split("\n").entries()) {
			if (lineIndex > 0) paragraph.append(document.createElement("br"));
			appendInline(paragraph, line);
		}
		root.append(paragraph);
	}
	return root;
}
