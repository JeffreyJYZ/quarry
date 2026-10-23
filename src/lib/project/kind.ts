import type { ProjectKind } from "@/lib/project/api";

const LABELS: Record<ProjectKind, string> = {
	cargo: "cargo",
	cmake: "cmake",
	compileCommands: "compile_commands",
	unknown: "unknown",
};

export function kindLabel(kind: ProjectKind): string {
	return LABELS[kind];
}
