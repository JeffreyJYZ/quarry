import { describe, expect, test } from "bun:test";
import { kindLabel } from "@/lib/project/kind";
import type { ProjectKind } from "@/lib/project/api";

const KINDS: ProjectKind[] = ["cargo", "cmake", "compileCommands", "unknown"];

describe("kindLabel", () => {
	for (const kind of KINDS) {
		test(kind, () => {
			expect(kindLabel(kind)).toBe(kind === "compileCommands" ? "compile_commands" : kind);
		});
	}
});
