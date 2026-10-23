import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { searchProject, type SearchReport } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import {
	groupMatches,
	type SearchGroup,
	type SearchOptions,
	type SearchRow,
	searchFlags,
	transformQuery,
} from "@/lib/search/model";
import { invalidQuery, searchSession } from "./parts";

export type SearchQuery = {
	query: string;
	setQuery: Dispatch<SetStateAction<string>>;
	report: SearchReport | null;
	error: string | null;
	setError: Dispatch<SetStateAction<string | null>>;
	busy: boolean;
	setBusy: Dispatch<SetStateAction<boolean>>;
	active: number;
	setActive: Dispatch<SetStateAction<number>>;
	ranQuery: string | null;
	trimmed: string;
	invalid: boolean;
	groups: SearchGroup[];
	rows: SearchRow[];
	fileCount: number;
	inputRef: RefObject<HTMLInputElement | null>;
	listRef: RefObject<HTMLDivElement | null>;
	move: (step: number) => void;
	submit: () => void;
};

export function useSearchQuery({
	root,
	initialQuery,
	onOpen,
	onClose,
	options,
	wholeWord,
}: {
	root: string;
	initialQuery?: string;
	onOpen: (path: string) => void;
	onClose: () => void;
	options: SearchOptions;
	wholeWord: boolean;
}): SearchQuery {
	const [query, setQuery] = useState(initialQuery ?? searchSession.lastQuery);
	const [report, setReport] = useState<SearchReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [active, setActive] = useState(0);
	const [ranQuery, setRanQuery] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const sequence = useRef(0);

	const fileCount = useMemo(
		() => (report === null ? 0 : new Set(report.matches.map((m) => m.path)).size),
		[report],
	);
	const groups = useMemo(() => (report === null ? [] : groupMatches(report.matches)), [report]);
	const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

	const invalid = invalidQuery(query, options, wholeWord);

	const run = useCallback(
		async (value: string) => {
			const next = value.trim();
			sequence.current += 1;
			const ticket = sequence.current;
			if (next === "") {
				setReport(null);
				setError(null);
				setBusy(false);
				setRanQuery("");
				setActive(0);
				return;
			}
			const transformed = transformQuery(next, options);
			if (wholeWord) {
				try {
					new RegExp(transformed);
				} catch {
					setReport(null);
					setRanQuery(next);
					setActive(0);
					setError("invalid regular expression");
					setBusy(false);
					return;
				}
			}
			setBusy(true);
			setError(null);
			try {
				const flags = searchFlags(options);
				const result = await searchProject(
					root,
					transformed,
					undefined,
					flags.caseSensitive,
					flags.fixedStrings,
				);
				if (ticket !== sequence.current) {
					return;
				}
				setReport(result);
				setRanQuery(next);
				setActive(0);
			} catch (failure) {
				if (ticket !== sequence.current) {
					return;
				}
				setReport(null);
				setRanQuery(next);
				setActive(0);
				setError(describeError(failure));
			} finally {
				if (ticket === sequence.current) {
					setBusy(false);
				}
			}
		},
		[root, options, wholeWord],
	);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	useEffect(() => {
		const host = listRef.current;
		if (host === null) {
			return;
		}
		host.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	useEffect(() => {
		searchSession.lastQuery = query;
	}, [query]);

	const move = (step: number) => {
		if (rows.length === 0) {
			return;
		}
		setActive((current) => (current + step + rows.length) % rows.length);
	};

	const trimmed = query.trim();

	const submit = () => {
		if (trimmed === "" || report === null || ranQuery !== trimmed) {
			void run(trimmed);
			return;
		}
		const row = rows[active];
		if (row !== undefined) {
			onOpen(row.match.path);
		}
	};

	return {
		query,
		setQuery,
		report,
		error,
		setError,
		busy,
		setBusy,
		active,
		setActive,
		ranQuery,
		trimmed,
		invalid,
		groups,
		rows,
		fileCount,
		inputRef,
		listRef,
		move,
		submit,
	};
}
