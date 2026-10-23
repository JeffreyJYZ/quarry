import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { listFiles } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { rankFiles, splitQuery as splitQueryRank } from "@/lib/quickopen/rank";
import { cache, recent, recordRecent, RECENT_LIMIT, STALE_MS } from "./parts";

export type QuickOpenController = {
	query: string;
	setQuery: (value: string) => void;
	files: string[];
	setFiles: (value: string[]) => void;
	error: string | null;
	busy: boolean;
	active: number;
	setActive: (value: number) => void;
	inputRef: RefObject<HTMLInputElement | null>;
	listRef: RefObject<HTMLDivElement | null>;
	fetchFiles: (force: boolean) => Promise<void>;
	primary: string;
	filter: string;
	isFilterActive: boolean;
	ranked: string[];
	mainList: string[];
	recentPaths: string[];
	displayList: string[];
	move: (step: number) => void;
	submit: () => void;
	jump: (to: "start" | "end") => void;
};

export function useQuickOpen({
	root,
	onOpen,
	onClose,
}: {
	root: string;
	onOpen: (path: string) => void;
	onClose: () => void;
}): QuickOpenController {
	const [query, setQuery] = useState("");
	const [files, setFiles] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const fetchTokenRef = useRef(0);

	const fetchFiles = useCallback(
		async (force: boolean) => {
			const cached = cache.get(root);
			if (!force && cached !== undefined && Date.now() - cached.fetchedAt < STALE_MS) {
				setFiles(cached.files);
				return;
			}
			const token = ++fetchTokenRef.current;
			setBusy(true);
			setError(null);
			try {
				const next = await listFiles(root);
				if (token !== fetchTokenRef.current) return;
				cache.set(root, { files: next, fetchedAt: Date.now() });
				setFiles(next);
			} catch (failure) {
				if (token !== fetchTokenRef.current) return;
				setError(describeError(failure));
			} finally {
				if (token === fetchTokenRef.current) setBusy(false);
			}
		},
		[root],
	);

	useEffect(() => {
		const cached = cache.get(root);
		const stale = cached === undefined || Date.now() - cached.fetchedAt > STALE_MS;
		void fetchFiles(stale);
	}, [root, fetchFiles]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			onClose();
		};
		const handleCmdP = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (event.key.toLowerCase() !== "p") return;
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", handleEscape);
		window.addEventListener("keydown", handleCmdP, true);
		return () => {
			window.removeEventListener("keydown", handleEscape);
			window.removeEventListener("keydown", handleCmdP, true);
		};
	}, [onClose]);

	const { primary, filter } = splitQueryRank(query);
	const isFilterActive = query.includes(" ") && filter.length > 0;

	const ranked = useMemo(() => {
		const q = primary.trim();
		if (q === "") {
			const recentPaths = recent.filter((path) => files.includes(path));
			return recentPaths.slice(0, RECENT_LIMIT);
		}
		let result = rankFiles(files, q);
		if (filter.trim() !== "") {
			const f = filter.trim().toLowerCase();
			result = result.filter((path) => path.toLowerCase().includes(f));
		}
		return result;
	}, [files, primary, filter]);

	const mainList = useMemo(() => {
		if (primary.trim() !== "") return ranked;
		const recentPaths = new Set(
			recent.filter((path) => files.includes(path)).slice(0, RECENT_LIMIT),
		);
		return files.filter((path) => !recentPaths.has(path));
	}, [files, primary, ranked]);

	const displayList =
		primary.trim() === ""
			? [...recent.filter((p) => files.includes(p)).slice(0, RECENT_LIMIT), ...mainList]
			: ranked;

	useEffect(() => {
		const host = listRef.current;
		if (host === null) return;
		host.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const move = (step: number) => {
		if (displayList.length === 0) return;
		setActive((current) => (current + step + displayList.length) % displayList.length);
	};

	const submit = () => {
		const path = displayList[active];
		if (path === undefined) return;
		recordRecent(path);
		onOpen(path);
		onClose();
	};

	const jump = (to: "start" | "end") => {
		if (displayList.length === 0) return;
		setActive(to === "start" ? 0 : displayList.length - 1);
	};

	const recentPaths = recent.filter((p) => files.includes(p)).slice(0, RECENT_LIMIT);

	return {
		query,
		setQuery,
		files,
		setFiles,
		error,
		busy,
		active,
		setActive,
		inputRef,
		listRef,
		fetchFiles,
		primary,
		filter,
		isFilterActive,
		ranked,
		mainList,
		recentPaths,
		displayList,
		move,
		submit,
		jump,
	};
}
