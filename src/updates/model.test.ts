import { describe, expect, test } from "bun:test";
import { isNewer, offerClause, offerHeadline, progressPercent } from "./model";

describe("isNewer", () => {
	test("newer patch", () => {
		expect(isNewer("1.0.1", "1.0.0")).toBe(true);
	});
	test("not newer equal", () => {
		expect(isNewer("1.0.0", "1.0.0")).toBe(false);
	});
	test("older", () => {
		expect(isNewer("0.9.9", "1.0.0")).toBe(false);
	});
	test("minor bump", () => {
		expect(isNewer("1.1.0", "1.0.9")).toBe(true);
	});
	test("major bump", () => {
		expect(isNewer("2.0.0", "1.9.9")).toBe(true);
	});
	test("malformed latest", () => {
		expect(isNewer("1.0", "1.0.0")).toBe(false);
	});
	test("malformed current", () => {
		expect(isNewer("1.0.0", "v1.0.0")).toBe(false);
	});
	test("non-numeric", () => {
		expect(isNewer("a.b.c", "1.0.0")).toBe(false);
	});
	test("alpha counter advances", () => {
		expect(isNewer("0.1.0-alpha.2", "0.1.0-alpha.1")).toBe(true);
		expect(isNewer("0.1.0-alpha.1", "0.1.0-alpha.2")).toBe(false);
		expect(isNewer("0.1.0-alpha.1", "0.1.0-alpha.1")).toBe(false);
	});
	test("a release outranks its alpha", () => {
		expect(isNewer("0.1.0", "0.1.0-alpha.9")).toBe(true);
		expect(isNewer("0.1.0-alpha.9", "0.1.0")).toBe(false);
	});
	test("alpha of a newer patch wins", () => {
		expect(isNewer("0.1.1-alpha.1", "0.1.0")).toBe(true);
	});
});

describe("clauses", () => {
	test("updater clause", () => {
		expect(offerClause({ kind: "updater", version: "1.0.0", update: null })).toBe(
			"is available.",
		);
	});
	test("github clause", () => {
		expect(offerClause({ kind: "github", version: "1.0.0" })).toBe(
			"is published, but this build cannot install it in-app.",
		);
	});
	test("headline", () => {
		expect(offerHeadline({ kind: "github", version: "2.0.0" })).toBe(
			"2.0.0 is published, but this build cannot install it in-app.",
		);
	});
});

describe("progressPercent", () => {
	test("with total", () => {
		expect(progressPercent(42, 100)).toBe(42);
	});
	test("unknown total null", () => {
		expect(progressPercent(42, null)).toBeNull();
		expect(progressPercent(42, undefined)).toBeNull();
	});
	test("zero total null", () => {
		expect(progressPercent(42, 0)).toBeNull();
	});
});
