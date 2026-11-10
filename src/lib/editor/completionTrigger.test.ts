import { describe, expect, test } from "bun:test";
import { type CompletionTrigger, shouldComplete } from "@/lib/editor/completionTrigger";

/** A trigger that opens: a two-character name in code, typed by hand. */
const trigger = (overrides: Partial<CompletionTrigger> = {}): CompletionTrigger => ({
	explicit: false,
	prefix: "ab",
	inCommentOrString: false,
	afterMemberAccess: false,
	...overrides,
});

describe("shouldComplete", () => {
	test("an explicit request always opens, wherever the caret is", () => {
		expect(shouldComplete(trigger({ explicit: true, prefix: "" }))).toBe(true);
		expect(shouldComplete(trigger({ explicit: true, prefix: "1" }))).toBe(true);
		expect(shouldComplete(trigger({ explicit: true, inCommentOrString: true }))).toBe(true);
	});

	const automatic: { label: string; overrides: Partial<CompletionTrigger>; opens: boolean }[] = [
		{ label: "no prefix at all", overrides: { prefix: "" }, opens: false },
		{ label: "one character", overrides: { prefix: "a" }, opens: false },
		{ label: "two characters", overrides: { prefix: "ab" }, opens: true },
		{ label: "three characters", overrides: { prefix: "abc" }, opens: true },
		{ label: "an underscore and a letter", overrides: { prefix: "_a" }, opens: true },
		{ label: "digits only", overrides: { prefix: "12" }, opens: false },
		{ label: "digits then a letter", overrides: { prefix: "12a" }, opens: true },
		{
			label: "in a comment",
			overrides: { prefix: "wor", inCommentOrString: true },
			opens: false,
		},
		{
			label: "in a string literal",
			overrides: { prefix: "wor", inCommentOrString: true },
			opens: false,
		},
		{
			label: "right after a member access, with no prefix",
			overrides: { prefix: "", afterMemberAccess: true },
			opens: true,
		},
		{
			label: "right after a member access, after one character",
			overrides: { prefix: "a", afterMemberAccess: true },
			opens: true,
		},
		{
			label: "right after a member access inside a comment",
			overrides: { prefix: "", afterMemberAccess: true, inCommentOrString: true },
			opens: false,
		},
	];

	for (const { label, overrides, opens } of automatic) {
		test(`an automatic request ${opens ? "opens" : "stays shut"} ${label}`, () => {
			expect(shouldComplete(trigger(overrides))).toBe(opens);
		});
	}
});
