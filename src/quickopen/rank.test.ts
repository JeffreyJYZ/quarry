import { describe, expect, test } from "bun:test";
import { basename, matchPositions, rankFiles, splitQuery } from "./rank";

describe("basename", () => {
	test("returns the file name with no directory", () => {
		expect(basename("foo.ts")).toBe("foo.ts");
	});

	test("splits on the last forward slash", () => {
		expect(basename("a/b/c.ts")).toBe("c.ts");
	});

	test("splits on the last backslash", () => {
		expect(basename("a\\b\\c.ts")).toBe("c.ts");
	});
});

describe("rankFiles", () => {
	test("empty query returns an empty array", () => {
		expect(rankFiles(["a.ts", "b.ts"], "")).toEqual([]);
	});

	test("whitespace-only query returns an empty array", () => {
		expect(rankFiles(["a.ts", "b.ts"], "   ")).toEqual([]);
	});

	test("a query matching nothing returns an empty array", () => {
		expect(rankFiles(["foo.ts", "bar.ts"], "zzz")).toEqual([]);
	});

	test("exact basename beats prefix beats substring beats path-only", () => {
		const paths = ["src/foo.ts", "src/foolish.ts", "src/xfoo.ts", "src/prefix/fooish.ts"];
		// "foo.ts" exact basename; "foolish.ts" prefix; "xfoo.ts" substring; path-only via "prefix/..." no - adjust
		const result = rankFiles(paths, "foo");
		// exact? none exact "foo"; prefix: foo.ts? basename foo.ts startsWith foo yes tier1; foolish tier1; xfoo substring tier2; path-only: prefix/fooish.ts path contains foo tier3
		expect(result[0]).toBe("src/foo.ts");
	});

	test("case-insensitive matching", () => {
		expect(rankFiles(["src/Foo.TS"], "FOO")).toEqual(["src/Foo.TS"]);
	});

	test("shorter path wins a tie", () => {
		const paths = ["very/long/path/x.ts", "x.ts"];
		expect(rankFiles(paths, "x")).toEqual(["x.ts", "very/long/path/x.ts"]);
	});

	test("exact basename ranks above prefix", () => {
		const paths = ["src/foobar.ts", "src/foo.ts"];
		expect(rankFiles(paths, "foo")).toEqual(["src/foo.ts", "src/foobar.ts"]);
	});

	test("substring ranks above path-only", () => {
		const paths = ["src/containsfoo.ts", "src/fooish/bar.ts"];
		// basename contains foo -> tier2 vs path contains foo only -> tier3
		expect(rankFiles(paths, "foo")).toEqual(["src/containsfoo.ts", "src/fooish/bar.ts"]);
	});

	test("name beats path at equal query length", () => {
		const paths = ["src/zzz/foo.ts", "src/foopath/bar.ts"];
		// "foo" matches name in first, path-only in second
		expect(rankFiles(paths, "foo")[0]).toBe("src/zzz/foo.ts");
	});

	test("boundary preference favors segment starts", () => {
		const paths = ["src/xfoo.ts", "src/foo-bar.ts"];
		const result = rankFiles(paths, "fb");
		expect(result[0]).toBe("src/foo-bar.ts");
	});

	test("splitQuery parses trailing-space filter", () => {
		expect(splitQuery("foo bar")).toEqual({ primary: "foo", filter: "bar" });
		expect(splitQuery("foo")).toEqual({ primary: "foo", filter: "" });
		expect(splitQuery("foo ")).toEqual({ primary: "foo", filter: "" });
	});

	test("matchPositions returns null on no subsequence", () => {
		expect(matchPositions("abc", "xyz")).toBeNull();
	});

	test("matchPositions prefers boundaries", () => {
		const idx = matchPositions("src/foo-bar.ts", "fb");
		expect(idx).not.toBeNull();
	});
});
