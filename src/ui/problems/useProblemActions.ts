import { useCallback, useEffect, useRef, useState } from "react";
import type { FileBuffer } from "@/lib/project/buffer";
import { type CodeAction, lspCodeActions } from "@/lib/project/api";
import { sessionForContext } from "@/lib/lsp/context";
import { applyFileEdits } from "@/lib/refactor/apply";
import { cacheKey } from "./parts";

export type ProblemActions = {
	menuKey: string | null;
	menuActions: CodeAction[];
	menuLoading: boolean;
	menuError: string | null;
	menuIndex: number;
	applied: string | null;
	openMenu: (path: string, line: number, character: number) => Promise<void>;
	closeMenu: () => void;
	applyAction: (action: CodeAction) => Promise<void>;
	setMenuIndex: (index: number) => void;
};

export function useProblemActions({
	root,
	buffers,
	setBuffers,
}: {
	root: string | null;
	buffers: FileBuffer[];
	setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
}): ProblemActions {
	const cache = useRef<Map<string, CodeAction[]>>(new Map());
	const [menuKey, setMenuKey] = useState<string | null>(null);
	const [menuActions, setMenuActions] = useState<CodeAction[]>([]);
	const [menuLoading, setMenuLoading] = useState(false);
	const [menuError, setMenuError] = useState<string | null>(null);
	const [menuIndex, setMenuIndex] = useState(0);
	const [applied, setApplied] = useState<string | null>(null);
	const appliedTimer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (appliedTimer.current !== null) window.clearTimeout(appliedTimer.current);
		},
		[],
	);

	const showApplied = useCallback((title: string) => {
		setApplied(title);
		if (appliedTimer.current !== null) window.clearTimeout(appliedTimer.current);
		appliedTimer.current = window.setTimeout(() => {
			appliedTimer.current = null;
			setApplied(null);
		}, 4000);
	}, []);

	const fetchActions = useCallback(
		async (path: string, line: number, character: number) => {
			const key = cacheKey(path, line, character);
			const cached = cache.current.get(key);
			if (cached !== undefined) {
				return cached;
			}
			if (root === null) {
				throw new Error("No project root: open a project to get quick fixes");
			}
			const session = sessionForContext(path);
			if (session === null) {
				throw new Error("No language server for this file: quick fixes unavailable");
			}
			const actions = await lspCodeActions(session, path, line, character);
			cache.current.set(key, actions);
			return actions;
		},
		[root],
	);

	const openMenu = useCallback(
		async (path: string, line: number, character: number) => {
			const key = cacheKey(path, line, character);
			setMenuKey(key);
			setMenuActions([]);
			setMenuError(null);
			setMenuLoading(true);
			setMenuIndex(0);
			try {
				const actions = await fetchActions(path, line, character);
				setMenuActions(actions);
				if (actions.length === 0) {
					setMenuError("No code actions available for this diagnostic");
					setMenuKey(null);
				}
			} catch (error) {
				setMenuError(error instanceof Error ? error.message : String(error));
				setMenuKey(null);
			} finally {
				setMenuLoading(false);
			}
		},
		[fetchActions],
	);

	const closeMenu = useCallback(() => {
		setMenuKey(null);
		setMenuActions([]);
		setMenuError(null);
		setMenuLoading(false);
	}, []);

	const applyAction = useCallback(
		async (action: CodeAction) => {
			if (action.edits.length === 0) {
				closeMenu();
				return;
			}
			closeMenu();
			try {
				await applyFileEdits(action.edits, buffers, setBuffers);
				showApplied(action.title);
			} catch (error) {
				setMenuError(error instanceof Error ? error.message : String(error));
			}
		},
		[buffers, setBuffers, closeMenu, showApplied],
	);

	return {
		menuKey,
		menuActions,
		menuLoading,
		menuError,
		menuIndex,
		applied,
		openMenu,
		closeMenu,
		applyAction,
		setMenuIndex,
	};
}
