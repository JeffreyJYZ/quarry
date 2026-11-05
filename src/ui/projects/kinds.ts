/** Everything the new-project dialog knows about the kinds it can scaffold. */

export type Kind = "rust-bin" | "rust-lib" | "c-cmake" | "cpp-cmake";

import { STANDARDS } from "@/lib/consts/projects";

export { KINDS, STANDARDS } from "@/lib/consts/projects";

export function defaultStandard(kind: Kind): string {
	return STANDARDS[kind][0].value;
}

/** The directory a new project is created in, with a trailing separator removed. */
export function parentOf(path: string): string {
	return path.replace(/[\\/]+$/, "");
}

export function joinPath(parent: string, name: string): string {
	const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
	return `${parentOf(parent)}${separator}${name.trim()}`;
}
