import type { TestItem } from "@/lib/project/api";
import { scanCppTests } from "@/lib/tests/cppScan";

/**
 * Where the C++ gutter puts its markers, and which backend case each one runs.
 *
 * The test set is still the backend's: this only reads the file's `TEST`-family macro lines and
 * matches each `gtest` item named `Suite.Case` to the macro that declares the same suite and case.
 * A file that declares no matching macro places nothing, and the program grouping stays the dock's.
 */

/** One backend gtest case and the line its macro sits on. */
export type CppPlacement = { line: number; name: string };

export function cppPlacements(items: readonly TestItem[], text: string): CppPlacement[] {
	const macros = scanCppTests(text);
	const out: CppPlacement[] = [];
	const seen = new Set<number>();
	for (const item of items) {
		if (item.suite !== "gtest") continue;
		const cut = item.name.indexOf(".");
		if (cut <= 0) continue;
		const suite = item.name.slice(0, cut);
		const name = item.name.slice(cut + 1);
		const macro = macros.find((entry) => entry.suite === suite && entry.name === name);
		if (macro === undefined || seen.has(macro.line)) continue;
		seen.add(macro.line);
		out.push({ line: macro.line, name: item.name });
	}
	return out.sort((left, right) => left.line - right.line);
}
