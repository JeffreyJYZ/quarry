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

export type TestItem = {
	name: string;
	/** Test binary a name belongs to: a Cargo source path, or the gtest program. */
	binary: string;
	/** Which suite owns the name: `cargo` or `gtest`. */
	suite: string;
};
export type TestReport = { name: string; passed: boolean; output: string; durationMs: number };

/** One discovery pass: the cases, the program a gtest list asked, and empty-list sentences. */
export type TestDiscovery = {
	items: TestItem[];
	/** The gtest program that was asked, when one was; null for a Cargo-only project. */
	program: string | null;
	/** One plain sentence per source that could not be listed, or that listed nothing. */
	notes: string[];
};

export function listTests(root: string): Promise<TestDiscovery> {
	return invoke<TestDiscovery>("list_tests", { root });
}

export function runTest(root: string, name: string): Promise<TestReport> {
	return invoke<TestReport>("run_test", { root, name });
}
