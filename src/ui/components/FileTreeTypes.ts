import type { FileEntry } from "@/lib/project/api";
import type { GitStatusEntry } from "@/lib/project/api";
import type { WatchBatch } from "@/lib/project/watch";

export type DirState =
	| { status: "loading" }
	| { status: "ready"; entries: FileEntry[] }
	| { status: "error"; message: string };

export type EditState =
	| { kind: "create-file"; parent: string }
	| { kind: "create-dir"; parent: string }
	| { kind: "rename"; target: string };

export type FileTreeProps = {
	root: string;
	activePath: string | null;
	onOpenFile: (entry: FileEntry) => void;
	onFileRenamed?: (oldPath: string, newPath: string) => void;
	onFileDeleted?: (path: string) => void;
	onNotice?: (message: string) => void;
	/** Right-click action: stop and start the language server for the open project. */
	onRestartLsp?: () => void;
	changes?: Record<string, GitStatusEntry["status"]>;
	revealToken?: number;
	/** The latest batch of externally changed paths, so listed directories can be read again. */
	watch?: WatchBatch | null;
};

export type { FileEntry, GitStatusEntry };
