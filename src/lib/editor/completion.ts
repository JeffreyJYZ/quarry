export function kindToType(kind: number | null): string {
	switch (kind) {
		case 2:
			return "method";
		case 3:
			return "function";
		case 4:
			return "constructor";
		case 5:
			return "field";
		case 6:
			return "variable";
		case 7:
			return "class";
		case 8:
			return "interface";
		case 9:
			return "namespace";
		case 10:
			return "property";
		case 13:
			return "enum";
		case 14:
			return "keyword";
		case 15:
			return "snippet";
		case 20:
			return "enumMember";
		case 21:
			return "constant";
		case 22:
			return "struct";
		case 23:
			return "event";
		case 24:
			return "operator";
		case 25:
			return "type";
		default:
			return "text";
	}
}

export function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const ch of text) {
		if (ch === "(" || ch === "<" || ch === "[" || ch === "{") depth += 1;
		else if (ch === ")" || ch === ">" || ch === "]" || ch === "}")
			depth = Math.max(0, depth - 1);
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts;
}
