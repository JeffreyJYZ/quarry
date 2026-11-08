import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every command the frontend invokes must exist in the Rust handler list.
 *
 * Two navigation commands were advertised in the palette, wrapped in `lspImplementation` and
 * `lspTypeDefinition`, and never registered — so the invoke was rejected, the handler turned the
 * rejection into an empty list, and the user was told "No implementation found". A missing endpoint
 * reading as an empty answer is invisible in review and only shows up as a feature that quietly does
 * nothing, which is what this test makes impossible to merge again.
 */

const API_DIR = join(import.meta.dir);
const LIB_RS = join(import.meta.dir, "../../../../src-tauri/src/lib.rs");

/** Every `invoke("name")` / `invoke<T>("name")` in the frontend's command wrappers. */
function invokedCommands(): Map<string, string> {
	const found = new Map<string, string>();
	for (const name of readdirSync(API_DIR)) {
		if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
		const text = readFileSync(join(API_DIR, name), "utf8");
		for (const match of text.matchAll(/invoke(?:<[^>]*>)?\(\s*"([a-z0-9_]+)"/g)) {
			if (match[1] !== undefined && !found.has(match[1])) found.set(match[1], name);
		}
	}
	return found;
}

/** The commands inside `tauri::generate_handler![…]`, by their last path segment. */
function registeredCommands(): Set<string> {
	const text = readFileSync(LIB_RS, "utf8");
	const start = text.indexOf("generate_handler![");
	expect(start).toBeGreaterThan(-1);
	const end = text.indexOf("])", start);
	expect(end).toBeGreaterThan(start);
	const block = text.slice(start, end).replace("generate_handler![", "");
	const names = new Set<string>();
	for (const line of block.split("\n")) {
		// The last entry carries no trailing comma, so the comma is stripped rather than required.
		const entry = line.trim().replace(/,$/, "");
		if (!/^[A-Za-z0-9_]+(?:::[A-Za-z0-9_]+)*$/.test(entry)) continue;
		const last = entry.split("::").pop();
		if (last !== undefined) names.add(last);
	}
	return names;
}

describe("tauri command names", () => {
	test("the wrappers are readable", () => {
		expect(invokedCommands().size).toBeGreaterThan(30);
	});

	test("every invoked command is registered in lib.rs", () => {
		const registered = registeredCommands();
		const missing = [...invokedCommands()].filter(([name]) => !registered.has(name));
		expect(missing).toEqual([]);
	});
});
