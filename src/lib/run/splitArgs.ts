/**
 * Split a single args input into an argv array using shell-like rules.
 *
 * Rules:
 * - Whitespace outside quotes separates arguments.
 * - A double quote toggles quoting; quoted content (including spaces)
 *   becomes part of the current argument.
 * - Inside quotes `\"` is a literal quote and `\\` a literal backslash; a
 *   backslash before anything else stays literal, so `"C:\temp"` keeps its slash.
 * - Outside quotes a backslash is literal, so a hand-written `C:\temp` survives.
 * - Trailing whitespace never produces an empty argument.
 * - An explicitly quoted empty string ("") yields one empty argument.
 */
export function splitArgs(input: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuote = false;
	let hasToken = false;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		const next = input[index + 1];
		if (inQuote && char === "\\" && (next === '"' || next === "\\")) {
			current += next;
			hasToken = true;
			index += 1;
			continue;
		}
		if (char === '"') {
			inQuote = !inQuote;
			hasToken = true;
			continue;
		}
		if (char === " " && !inQuote) {
			if (hasToken || current.length > 0) {
				result.push(current);
				current = "";
				hasToken = false;
			}
			continue;
		}
		current += char;
		hasToken = true;
	}
	if (hasToken || current.length > 0) {
		result.push(current);
	}
	return result;
}
