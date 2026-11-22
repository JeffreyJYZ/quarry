import { invoke } from "@tauri-apps/api/core";
import type { ProjectInfo } from "./backend";

/**
 * Scaffolds the folder the user opened into a project, in place.
 *
 * The backend decides whether the folder is empty enough: the UI never pre-checks it, so the two
 * cannot disagree about what may be initialized. The returned info is already inspected, the same
 * shape `open_project` gives, so it can go straight through the shell's project activation path.
 */
export function initProject(
	root: string,
	kind: "rust-bin" | "rust-lib" | "c-cmake" | "cpp-cmake",
	standard: string,
): Promise<ProjectInfo> {
	return invoke<ProjectInfo>("init_project", { root, kind, standard });
}
