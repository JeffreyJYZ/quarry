/**
 * Making the moved items reachable.
 *
 * A child module is its own privacy scope, so every item and field has to be widened to `pub` or
 * `pub(crate)`; the re-exports in `mod.rs` then keep every existing `crate::foo::X` path working.
 */

/** Widens a struct's fields so a sibling module can construct and read them. */
export function widenFields(text: string): string {
	const lines = text.split("\n");
	const open = lines.findIndex((line) => line.trim().endsWith("{"));
	if (open === -1) return text;
	let depth = 0;
	for (let i = open; i < lines.length; i += 1) {
		const line = lines[i];
		if (
			i > open &&
			depth === 1 &&
			/^\s+[a-z_][A-Za-z0-9_]*:/.test(line) &&
			!line.trim().startsWith("pub")
		) {
			lines[i] = line.replace(/^(\s+)/, "$1pub(crate) ");
		}
		for (const char of line) {
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
		}
	}
	return lines.join("\n");
}

/** Widens an inherent method so the parent module's command wrappers can call it. */
export function widenMethods(text: string): string {
	const lines = text.split("\n");
	// Trait impls (`impl Debug for Session`) cannot carry method visibility.
	const header = lines.find((line) => line.trimStart().startsWith("impl")) ?? "";
	if (header.includes(" for ")) return text;
	let depth = 0;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (
			depth === 1 &&
			/^\s{4,}(?:async\s+)?(?:unsafe\s+)?fn\s+[a-z_]/.test(line) &&
			!line.trim().startsWith("pub")
		) {
			lines[i] = line.replace(/^(\s+)/, "$1pub(crate) ");
		}
		for (const char of line) {
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
		}
	}
	return lines.join("\n");
}

/** Widens a top-level item, and a struct's fields, so a sibling module can use them. */
export function widen(text: string): string {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const trimmed = lines[i].trim();
		if (
			trimmed === "" ||
			trimmed.startsWith("#[") ||
			trimmed.startsWith("///") ||
			trimmed.startsWith("//")
		) {
			continue;
		}
		if (/^(pub(\([^)]*\))?\s+)?impl\b/.test(trimmed)) return widenMethods(text);
		if (/^pub(\([^)]*\))?\s+(struct|enum|union)\b/.test(trimmed)) return widenFields(text);
		if (/^pub(\([^)]*\))?\s/.test(trimmed)) return text;
		if (/^(struct|enum|union)\b/.test(trimmed)) {
			lines[i] = `pub ${lines[i]}`;
			return widenFields(lines.join("\n"));
		}
		if (/^(trait|type|const|static|fn|async|unsafe|mod)\b/.test(trimmed)) {
			lines[i] = `pub ${lines[i]}`;
			return lines.join("\n");
		}
		return text;
	}
	return text;
}
