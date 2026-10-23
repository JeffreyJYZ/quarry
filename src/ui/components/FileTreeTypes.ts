import type { FileEntry } from "@/lib/project/api";
import type { GitStatusEntry } from "@/lib/project/api";

export type DirState =
	| { status: "loading" }
	| { status: "ready"; entries: FileEntry[] }
	| { status: "error"; message: string };

export type EditState =
	| { kind: "create-file"; parent: string }
	| { kind: "create-dir"; parent: string }
	| { kind: "rename"; target: string };

export type { FileEntry, GitStatusEntry };
