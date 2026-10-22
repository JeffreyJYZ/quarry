/**
 * Split a single args input into an argv array using shell-like rules.
 *
 * Rules:
 * - Whitespace outside quotes separates arguments.
 * - A run of double quotes toggles quoting; quoted content (including spaces)
 *   becomes part of the current argument.
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
