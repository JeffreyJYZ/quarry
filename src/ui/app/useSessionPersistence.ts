import { useEffect, useRef } from "react";
import { readSettings, readTextFile, settingsForWrite, writeSettings } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { fileName } from "@/lib/problems/model";
import { normalizePreferences } from "@/lib/settings/model";
import { describeError } from "@/lib/project/errors";
import type { Settings } from "@/lib/project/api";
import type { DockTab } from "@/ui/tests/TestsDock";
import type { ProjectInfo, RunConfiguration } from "@/lib/project/api";
import { snapshotSignature } from "@/ui/app/sessionSignature";
import { openProject } from "@/lib/project/api";

export type SessionSnapshot = {
	project: ProjectInfo | null;
	buffers: FileBuffer[];
	activePath: string | null;
	railCollapsed: boolean;
	debugOpen: boolean;
	gitOpen: boolean;
	panelOpen: boolean | null;
	dockTab: DockTab;
	runConfigurations: RunConfiguration[];
	preferences: Settings["preferences"];
	recentFiles: string[];
	newProjectParent: string;
};

export type SessionSetters = {
	onPreferences: (value: Settings["preferences"]) => void;
	onRailCollapsed: (value: boolean) => void;
	onDebugOpen: (value: boolean) => void;
	onGitOpen: (value: boolean) => void;
	onPanelOpen: (value: boolean | null) => void;
	onRecentRoots: (value: string[]) => void;
	onRecentFiles: (value: string[]) => void;
	onNewProjectParent: (value: string) => void;
	onDockTab: (value: DockTab) => void;
	onRunConfigurations: (value: RunConfiguration[]) => void;
	onProject: (value: ProjectInfo) => void;
	onBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
	onActivePath: (value: string | null) => void;
	onNotice: (message: string) => void;
};

/**
 * Restores the last session on launch and writes the current one back.
 *
 * The restore runs once; the write is debounced and also fires when the window is hidden, so a
 * quit that skips React's cleanup still lands the last state on disk.
 */
export function useSessionPersistence(options: {
	snapshotRef: React.RefObject<SessionSnapshot>;
	setters: SessionSetters;
}): { restoredRef: React.RefObject<boolean>; preserved: React.RefObject<Record<string, unknown>> } {
	const { snapshotRef, setters } = options;
	const restoredRef = useRef(false);
	const preserved = useRef<Record<string, unknown>>({});

	// biome-ignore lint/correctness/useExhaustiveDependencies: the setters are stable dispatch functions
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await readSettings();
				if (cancelled) return;
				preserved.current = settings;
				setters.onPreferences(normalizePreferences(settings.preferences));
				setters.onRailCollapsed(settings.railCollapsed ?? false);
				setters.onDebugOpen(settings.debugOpen ?? false);
				setters.onGitOpen(settings.gitOpen ?? false);
				setters.onPanelOpen(settings.dockExpanded ?? null);
				setters.onRecentRoots(settings.recentRoots ?? []);
				setters.onRecentFiles(settings.recentFiles ?? []);
				setters.onNewProjectParent(settings.newProjectParent ?? "");
				setters.onRunConfigurations(settings.runConfigurations ?? []);
				const storedTab = settings.dockTab;
				setters.onDockTab(
					storedTab === "tests" || storedTab === "problems" ? storedTab : "problems",
				);
				if (settings.lastRoot === null) return;
				try {
					const next = await openProject(settings.lastRoot);
					if (cancelled) return;
					setters.onProject(next);
					setters.onBuffers(() => []);
					setters.onActivePath(null);
					for (const path of settings.openFiles) {
						if (cancelled) return;
						const name = fileName(path);
						try {
							const text = await readTextFile(path);
							if (cancelled) return;
							setters.onBuffers((current) =>
								current.some((buffer) => buffer.path === path)
									? current
									: [...current, { path, name, text, loaded: text }],
							);
						} catch {
							/* skip unreadable file */
						}
					}
					if (
						settings.activeFile !== null &&
						settings.openFiles.includes(settings.activeFile)
					) {
						setters.onActivePath(settings.activeFile);
					}
				} catch {
					try {
						await writeSettings(
							settingsForWrite(preserved.current, {
								lastRoot: null,
								openFiles: [],
								activeFile: null,
							}),
						);
					} catch {
						/* a settings file that cannot be rewritten is not worth a notice */
					}
				}
			} catch (error) {
				if (!cancelled) setters.onNotice(describeError(error));
			} finally {
				if (!cancelled) restoredRef.current = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const write = () => {
		if (!restoredRef.current) return;
		const snapshot = snapshotRef.current;
		if (snapshot === null) return;
		const settings: Settings = {
			lastRoot: snapshot.project?.root ?? null,
			openFiles: snapshot.buffers.map((buffer) => buffer.path),
			activeFile: snapshot.activePath,
			railCollapsed: snapshot.railCollapsed,
			debugOpen: snapshot.debugOpen,
			gitOpen: snapshot.gitOpen,
			dockTab: snapshot.dockTab as Settings["dockTab"],
			dockExpanded: snapshot.panelOpen,
			runConfigurations: snapshot.runConfigurations,
			preferences: snapshot.preferences,
			recentFiles: snapshot.recentFiles,
		};
		void writeSettings(settingsForWrite(preserved.current, settings)).catch(() => {
			/* a failed write is retried by the next change */
		});
	};

	// Debounced because typing moves the caret and the buffer on every keystroke.
	// A counter that only moves when the serialized snapshot changes keeps the timer from being
	// cleared on every unrelated render.
	const serialized = snapshotSignature(snapshotRef.current);
	const changeCounter = useRef(0);
	const previousSerialized = useRef<string | null>(null);
	if (serialized !== previousSerialized.current) {
		previousSerialized.current = serialized;
		changeCounter.current += 1;
	}
	// biome-ignore lint/correctness/useExhaustiveDependencies: changeCounter is a ref-derived change token
	useEffect(() => {
		const timer = window.setTimeout(write, 400);
		return () => window.clearTimeout(timer);
	}, [changeCounter.current]);

	// A hidden window means a quit is likely; write before the webview goes away.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the write reads a ref, not a value
	useEffect(() => {
		const handleVisibility = () => {
			if (document.visibilityState === "hidden") write();
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => document.removeEventListener("visibilitychange", handleVisibility);
	}, []);

	return { restoredRef, preserved };
}
