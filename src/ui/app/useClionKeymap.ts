import { useEffect } from "react";
import { inEditableTarget, inTerminal } from "@/ui/app/focusGuard";

export type ClionKeymapContext = {
	root: string | null;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	running: string | null;
	debug: {
		status: string;
		step: (kind: "next" | "stepIn" | "stepOut") => void;
		continueRun: () => void;
		launch: () => void;
	};
	run: () => void;
	debugNow: () => void;
	stop: () => void;
	toggleBreakpoint: (path: string, line: number) => void;
	organizeImports: () => void;
	openRunPanel: () => void;
	setDebugOpen: (updater: (current: boolean) => boolean) => void;
	setGotoMode: (mode: "class" | "symbol" | "recent") => void;
	setGenerateOpen: (open: boolean) => void;
	setQuickOpenOpen: (open: boolean) => void;
	setRailCollapsed: (updater: (current: boolean) => boolean) => void;
	setTerminalOpen: (updater: (current: boolean) => boolean) => void;
	setSettingsOpen: (open: boolean) => void;
	setSettingsTab: (tab: "user" | "project") => void;
	gotoImplementation: () => void;
	gotoTypeDefinition: () => void;
	quickDoc: () => void;
};

/**
 * CLion's macOS map, for the actions quarry already has.
 *
 * IntelliJ keeps Cmd for navigation and hands the run actions to Control so that is what these are.
 * Step keys only act while a session is live, so the same keys do nothing for the rest of the time.
 */
export function useClionKeymap(context: ClionKeymapContext): void {
	const { root, activePath, cursor, running, debug, run, debugNow, stop, toggleBreakpoint } =
		context;

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (inEditableTarget() || inTerminal()) return;
			const mod = event.metaKey || event.ctrlKey;
			const ctrlOnly = event.ctrlKey && !event.metaKey && !event.altKey;
			const key = event.key.toLowerCase();
			const live = debug.status === "running" || debug.status === "stopped";

			if (ctrlOnly && key === "r") {
				event.preventDefault();
				run();
				return;
			}
			if (ctrlOnly && key === "d") {
				event.preventDefault();
				debugNow();
				return;
			}
			if (ctrlOnly && event.key === "F2") {
				event.preventDefault();
				stop();
				return;
			}
			if (event.shiftKey && event.key === "F10") {
				event.preventDefault();
				run();
				return;
			}
			if (event.shiftKey && event.key === "F9") {
				event.preventDefault();
				debugNow();
				return;
			}
			if (mod && !event.altKey && key === "r") {
				event.preventDefault();
				void (async () => {
					if (running !== null) await stop();
					run();
				})();
				return;
			}
			if (live && event.key === "F7") {
				event.preventDefault();
				debug.step("stepIn");
				return;
			}
			if (live && event.key === "F8") {
				event.preventDefault();
				debug.step(event.shiftKey ? "stepOut" : "next");
				return;
			}
			if (live && event.key === "F9") {
				event.preventDefault();
				debug.continueRun();
				return;
			}
			if (mod && !event.altKey && key === "f8" && activePath !== null && cursor !== null) {
				event.preventDefault();
				toggleBreakpoint(activePath, cursor.line + 1);
				return;
			}
			if (mod && !event.shiftKey && !event.altKey && key === "o") {
				event.preventDefault();
				if (root !== null) context.setGotoMode("class");
				return;
			}
			if (mod && event.shiftKey && !event.altKey && key === "o") {
				event.preventDefault();
				if (root !== null) context.setQuickOpenOpen(true);
				return;
			}
			if (mod && event.altKey && key === "o") {
				event.preventDefault();
				if (activePath !== null) context.setGotoMode("symbol");
				return;
			}
			if (ctrlOnly && key === "e") {
				event.preventDefault();
				context.setGotoMode("recent");
				return;
			}
			if (mod && !event.shiftKey && !event.altKey && key === "n") {
				event.preventDefault();
				if (activePath !== null) context.setGenerateOpen(true);
				return;
			}
			if (event.ctrlKey && event.altKey && !event.metaKey && key === "o") {
				event.preventDefault();
				context.organizeImports();
				return;
			}
			if (event.ctrlKey && event.altKey && !event.metaKey && (key === "r" || key === "d")) {
				event.preventDefault();
				context.openRunPanel();
				return;
			}
			if (mod && !event.altKey && key === "1") {
				event.preventDefault();
				context.setRailCollapsed((current) => !current);
				return;
			}
			if (mod && !event.altKey && key === "5") {
				event.preventDefault();
				if (root !== null) context.setDebugOpen((current) => !current);
				return;
			}
			if (event.key === "F1") {
				event.preventDefault();
				context.quickDoc();
				return;
			}
			if (mod && event.altKey && key === "b") {
				event.preventDefault();
				context.gotoImplementation();
				return;
			}
			if (mod && event.altKey && key === "y") {
				event.preventDefault();
				context.gotoTypeDefinition();
				return;
			}
			if (event.altKey && event.key === "F12") {
				event.preventDefault();
				context.setTerminalOpen((current) => !current);
				return;
			}
			if (mod && !event.altKey && event.key === ";") {
				event.preventDefault();
				context.setSettingsTab(root === null ? "user" : "project");
				context.setSettingsOpen(true);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activePath, cursor, debug, debugNow, run, stop, root, running, toggleBreakpoint, context]);
}
