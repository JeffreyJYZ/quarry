import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	applyTestFilters,
	composeFailureLines,
	type ResultFilter,
	type SortDir,
} from "@/lib/tests/filterTests";
import type { TestItem } from "@/lib/project/api";
import type { TestsController } from "@/lib/tests/useTests";
import { countByBinary } from "./parts";
import type { DockTab } from "./parts";

export type DockFilters = {
	filter: string;
	changeFilter: (value: string) => void;
	filterRef: React.RefObject<HTMLInputElement | null>;
	binaries: [string, number][];
	binaryFilter: string | null;
	changeBinary: (value: string | null) => void;
	resultFilter: ResultFilter;
	changeResult: (value: ResultFilter) => void;
	sort: SortDir;
	toggleSort: () => void;
	collapsedGroups: Set<string>;
	toggleGroup: (binary: string) => void;
	highlighted: number;
	onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
	filtered: TestItem[];
	failed: number;
	copyStatus: string | null;
	copyFailures: (event: { stopPropagation: () => void }) => Promise<void>;
};

export function useDockFilters({
	tests,
	tab,
	expanded,
}: {
	tests: TestsController;
	tab: DockTab;
	expanded: boolean;
}): DockFilters {
	const [filter, setFilter] = useState("");
	const [binaryFilter, setBinaryFilter] = useState<string | null>(null);
	const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
	const [sort, setSort] = useState<SortDir>("az");
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const [highlighted, setHighlighted] = useState(-1);
	const [copyStatus, setCopyStatus] = useState<string | null>(null);
	const filterRef = useRef<HTMLInputElement | null>(null);
	const { load } = tests;

	const binaries = useMemo(() => countByBinary(tests.items), [tests.items]);

	const filtered = useMemo(
		() =>
			applyTestFilters(tests.items, tests.results, {
				text: filter,
				binary: binaryFilter,
				result: resultFilter,
				sort,
			}),
		[tests.items, tests.results, filter, binaryFilter, resultFilter, sort],
	);

	/* The test list loads once, the first time the tests tab is opened. */
	useEffect(() => {
		if (tab === "tests") {
			load();
		}
	}, [tab, load]);

	/* The filter takes the focus when the tests view opens. */
	useEffect(() => {
		if (tab === "tests" && expanded) {
			filterRef.current?.focus();
		}
	}, [tab, expanded]);

	const failed = useMemo(() => {
		let count = 0;
		for (const report of tests.results.values()) {
			if (!report.passed) {
				count += 1;
			}
		}
		return count;
	}, [tests.results]);

	const changeFilter = (value: string) => {
		setFilter(value);
		setHighlighted(-1);
	};

	const changeBinary = (value: string | null) => {
		setBinaryFilter(value);
		setHighlighted(-1);
	};

	const changeResult = (value: ResultFilter) => {
		setResultFilter(value);
		setHighlighted(-1);
	};

	const toggleSort = () => {
		setSort((current) => (current === "az" ? "za" : "az"));
	};

	const toggleGroup = (binary: string) => {
		setCollapsedGroups((current) => {
			const next = new Set(current);
			if (next.has(binary)) {
				next.delete(binary);
			} else {
				next.add(binary);
			}
			return next;
		});
	};

	const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlighted((current) => {
				if (filtered.length === 0) {
					return -1;
				}
				if (current < 0) {
					return 0;
				}
				return Math.min(current + 1, filtered.length - 1);
			});
			return;
		}
		if (event.key === "Enter") {
			if (highlighted >= 0 && highlighted < filtered.length) {
				event.preventDefault();
				tests.runOne(filtered[highlighted].name);
			}
			return;
		}
		if (event.key === "Escape") {
			setHighlighted(-1);
		}
	};

	const copyFailures = async (event: { stopPropagation: () => void }) => {
		event.stopPropagation();
		const lines = composeFailureLines(tests.items, tests.results);
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(lines.join("\n"));
			setCopyStatus("Copied");
			window.setTimeout(() => setCopyStatus(null), 2000);
		} catch (error) {
			setCopyStatus(error instanceof Error ? error.message : "copy failed");
			window.setTimeout(() => setCopyStatus(null), 2000);
		}
	};

	return {
		filter,
		changeFilter,
		filterRef,
		binaries,
		binaryFilter,
		changeBinary,
		resultFilter,
		changeResult,
		sort,
		toggleSort,
		collapsedGroups,
		toggleGroup,
		highlighted,
		onKeyDown,
		filtered,
		failed,
		copyStatus,
		copyFailures,
	};
}
