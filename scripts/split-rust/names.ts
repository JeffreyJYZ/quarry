/**
 * Names that already mean something to the compiler; a module called `diagnostic` breaks macros.
 */

const RESERVED = new Set(["diagnostic", "rustc", "clippy", "miri", "test", "std", "core", "alloc"]);

export function uniqueName(base: string, used: Set<string>): string {
	let name = RESERVED.has(base) ? `${base}_part` : base;
	let index = 2;
	while (used.has(name)) {
		name = `${base}_${index}`;
		index += 1;
	}
	used.add(name);
	return name;
}
