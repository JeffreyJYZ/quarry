import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { GitPanelTab } from "@/lib/git/useHistory";
import type { GitStatus } from "@/lib/project/api";

type PanelKeysOptions = {
	tab: GitPanelTab;
	setTab: Dispatch<SetStateAction<GitPanelTab>>;
	selected: string | null;
	status: GitStatus | null;
	stage: (paths: string[]) => Promise<void>;
	unstage: (paths: string[]) => Promise<void>;
};

/** The two window-level keybindings the panel owns: Tab between tabs, ⌘Enter to stage. */
export function usePanelKeys({ tab, setTab, selected, status, stage, unstage }: PanelKeysOptions) {
	// Tab switches from Changes to History too.
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (tab !== "changes") return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
			if (event.key === "Tab") {
				event.preventDefault();
				setTab("history");
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [tab, setTab]);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key !== "Enter") return;
			if (selected === null || status === null) return;
			const entry = status.entries.find((item) => item.path === selected);
			if (!entry) return;
			event.preventDefault();
			if (event.shiftKey) {
				if (entry.staged) void unstage([entry.path]);
			} else {
				if (!entry.staged) void stage([entry.path]);
			}
		};
		window.addEventListener("keydown", handler, true);
		return () => window.removeEventListener("keydown", handler, true);
	}, [selected, status, stage, unstage]);
}
