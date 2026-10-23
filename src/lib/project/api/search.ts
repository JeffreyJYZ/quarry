import { invoke } from "@tauri-apps/api/core";

export type SearchMatch = {
	path: string;
	/** 1-based. */
	line: number;
	/** 1-based byte column. */
	column: number;
	text: string;
};

export type SearchReport = {
	matches: SearchMatch[];
	truncated: boolean;
	durationMs: number;
};

export type ReplaceReport = {
	filesChanged: number;
	replacements: number;
	errors: string[];
};

export function searchProject(
	root: string,
	query: string,
	maxResults?: number,
	caseSensitive?: boolean,
	fixedStrings?: boolean,
): Promise<SearchReport> {
	return invoke<SearchReport>("search_project", {
		root,
		query,
		maxResults: maxResults ?? null,
		caseSensitive: caseSensitive ?? null,
		fixedStrings: fixedStrings ?? null,
	});
}

export function replaceProject(
	root: string,
	query: string,
	replacement: string,
	caseSensitive?: boolean,
	fixedStrings?: boolean,
): Promise<{
	files_changed: number;
	replacements: number;
	errors: string[];
}> {
	return invoke("replace_project", {
		root,
		query,
		replacement,
		caseSensitive: caseSensitive ?? null,
		fixedStrings: fixedStrings ?? null,
	});
}

export type TestItem = { name: string; binary: string };
export type TestReport = { name: string; passed: boolean; output: string; durationMs: number };

export function listTests(root: string): Promise<TestItem[]> {
	return invoke<TestItem[]>("list_tests", { root });
}

export function runTest(root: string, name: string): Promise<TestReport> {
	return invoke<TestReport>("run_test", { root, name });
}
